import cluster from 'node:cluster';
import {promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Server} from 'node:http';
import {FimiproxyRuntimeConfig} from '../types.js';
import {
  setHttpProxyArtifact,
  setHttpsProxyArtifact,
  setWsProxyForHttpArtifact,
  setWsProxyForHttpsArtifact,
} from './artifacts.js';
import {createHttpProxyUsingConfig} from './createHttpProxy.js';
import {createHttpsProxyUsingConfig} from './createHttpsProxy.js';
import {setupGracefulShutdown} from './endFimiproxy.js';
import {
  FimiproxyInstance,
  setActiveInstance,
} from './instance.js';
import {errorToLogFields, logger} from './logger.js';
import {prepareRoutesFromConfig} from './routes.js';

async function exposeServer(server?: Server, port?: string) {
  return new Promise<void>((resolve, reject) => {
    if (server && port) {
      server.listen(port, () => resolve());
      server.once('error', reject);
    } else {
      resolve();
    }
  });
}

async function startClusterPrimary(
  config: FimiproxyRuntimeConfig,
  exitProcessOnShutdown: boolean,
) {
  const workers =
    typeof config.workers === 'number' && config.workers > 1
      ? Math.floor(config.workers)
      : 1;

  const workerExec = fileURLToPath(
    new URL('./clusterWorker.js', import.meta.url),
  );
  cluster.setupPrimary({exec: workerExec});

  const configPath = join(
    tmpdir(),
    `fimiproxy-cluster-${process.pid}-${Date.now()}.json`,
  );
  await fsPromises.writeFile(configPath, JSON.stringify(config), 'utf8');

  let shuttingDown = false;
  const forkWorker = () => {
    return cluster.fork({
      FIMIPROXY_CONFIG_FILEPATH: configPath,
      FIMIPROXY_IS_WORKER: '1',
      FIMIPROXY_EXIT_ON_SHUTDOWN: exitProcessOnShutdown ? '1' : '0',
      FIMIPROXY_CLUSTER_CONFIG_PATH: configPath,
    });
  };

  const ready: Promise<void>[] = [];
  for (let i = 0; i < workers; i++) {
    ready.push(
      new Promise<void>((resolve, reject) => {
        const worker = forkWorker();
        const timer = setTimeout(() => {
          reject(new Error(`cluster worker ${worker.id} ready timeout`));
        }, 30_000);
        worker.once('online', () => {
          // Worker process started; give it a beat to bind ports.
          clearTimeout(timer);
          setTimeout(resolve, 200);
        });
        worker.once('error', err => {
          clearTimeout(timer);
          reject(err);
        });
      }),
    );
  }

  await Promise.all(ready);
  logger.info('cluster primary started', {workers, pid: process.pid});

  cluster.on('exit', (worker, code, signal) => {
    logger.error('cluster worker exited', {
      workerId: worker.id,
      code,
      signal,
    });
    if (!shuttingDown) {
      logger.info('restarting cluster worker');
      forkWorker();
    }
  });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('cluster primary shutting down');
    const ids = Object.keys(cluster.workers ?? {});
    await Promise.all(
      ids.map(
        id =>
          new Promise<void>(resolve => {
            const w = cluster.workers?.[id];
            if (!w) {
              resolve();
              return;
            }
            w.once('exit', () => resolve());
            w.process.kill('SIGTERM');
          }),
      ),
    );
    try {
      await fsPromises.unlink(configPath);
    } catch {
      // ignore
    }
    if (exitProcessOnShutdown) {
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

export async function startFimiproxyUsingConfig(
  config: FimiproxyRuntimeConfig,
  shouldHandleGracefulShutdown = true,
  exitProcessOnShutdown = true,
) {
  // Tests and explicit single-process callers pass shouldHandleGracefulShutdown=false
  // or workers:1. Cluster only when workers>1 and we are the primary process.
  const forceSingleProcess =
    !shouldHandleGracefulShutdown ||
    process.env.FIMIPROXY_IS_WORKER === '1' ||
    (typeof config.workers === 'number' && config.workers <= 1);

  const instance = new FimiproxyInstance(config, {forceSingleProcess});
  setActiveInstance(instance);

  if (
    instance.config.workers > 1 &&
    cluster.isPrimary &&
    process.env.FIMIPROXY_IS_WORKER !== '1'
  ) {
    // Primary does not hold proxy sockets; workers do.
    setActiveInstance(undefined);
    await instance.dispose();
    await startClusterPrimary(
      {...config, workers: instance.config.workers},
      exitProcessOnShutdown,
    );
    return;
  }

  prepareRoutesFromConfig(instance.config);

  const [httpProxy, httpsProxy] = await Promise.all([
    createHttpProxyUsingConfig(instance.config),
    createHttpsProxyUsingConfig(instance.config),
  ]);

  await Promise.all([
    httpProxy && exposeServer(httpProxy.httpProxy, instance.config.httpPort),
    httpsProxy &&
      exposeServer(httpsProxy.httpsProxy, instance.config.httpsPort),
  ]);

  if (httpProxy) {
    logger.info('http proxy listening', {port: instance.config.httpPort});
  }

  if (httpsProxy) {
    logger.info('https proxy listening', {port: instance.config.httpsPort});
  }

  logger.info('fimiproxy started', {
    pid: process.pid,
    workers: instance.config.workers,
    isWorker: process.env.FIMIPROXY_IS_WORKER === '1',
  });

  setHttpProxyArtifact(httpProxy?.httpProxy);
  setHttpsProxyArtifact(httpsProxy?.httpsProxy);
  setWsProxyForHttpArtifact(httpProxy?.wsProxy);
  setWsProxyForHttpsArtifact(httpsProxy?.wssProxy);

  instance.startBackgroundServices();

  if (shouldHandleGracefulShutdown) {
    setupGracefulShutdown(exitProcessOnShutdown);
  }
}

export async function startFimiproxyUsingConfigFile(filepath: string) {
  const file = await fsPromises.readFile(filepath, 'utf-8');
  const config = JSON.parse(file) as FimiproxyRuntimeConfig;
  await startFimiproxyUsingConfig(config);
}

export async function startFimiproxyUsingProcessArgs(
  props: {
    dontThrow?: boolean;
  } = {
    dontThrow: false,
  },
) {
  const {dontThrow = false} = props;
  const configFilepath = process.argv[2];
  if (!configFilepath) {
    if (dontThrow) {
      return false;
    }
    throw new Error('fimiproxy config filepath not provided');
  }
  await startFimiproxyUsingConfigFile(configFilepath);
  return true;
}

export const kFimiproxyConfigFilepathEnvVar = 'FIMIPROXY_CONFIG_FILEPATH';

export async function startFimiproxyUsingEnvVar(
  props: {
    varName?: string;
    dontThrow?: boolean;
  } = {
    varName: kFimiproxyConfigFilepathEnvVar,
    dontThrow: false,
  },
) {
  const {varName = kFimiproxyConfigFilepathEnvVar, dontThrow = false} = props;
  const configFilepath = process.env[varName];
  if (!configFilepath) {
    if (dontThrow) {
      return false;
    }
    throw new Error(`provide ${varName} env variable`);
  }
  await startFimiproxyUsingConfigFile(configFilepath);
  return true;
}

// Re-export for callers that need error context on listen failures
export {errorToLogFields};
