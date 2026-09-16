import gracefulShutdown from 'http-graceful-shutdown';
import {clearArtifacts, getArtifacts} from './artifacts.js';
import {getActiveInstance, setActiveInstance} from './instance.js';
import {logger} from './logger.js';
import {clearRoutes} from './routes.js';

type ShutdownFn = () => Promise<unknown>;

let registeredShutdowns: ShutdownFn[] = [];
let shuttingDown: Promise<void> | undefined;

async function cleanupInstance() {
  const instance = getActiveInstance();
  await instance?.dispose();
  clearArtifacts();
  clearRoutes();
  setActiveInstance(undefined);
  registeredShutdowns = [];
  logger.info('fimiproxy ended');
}

/**
 * Register SIGINT/SIGTERM graceful shutdown for the active proxy servers.
 * Does not shut down immediately.
 */
export function setupGracefulShutdown(exitProcess = true) {
  const {httpProxy, httpsProxy} = getArtifacts();
  registeredShutdowns = [];

  const onShutdown = async () => {
    await cleanupInstance();
    if (exitProcess) {
      // eslint-disable-next-line no-process-exit
      process.exit();
    }
  };

  if (httpProxy) {
    const shutdownHttp = gracefulShutdown(httpProxy, {
      forceExit: false,
      onShutdown: () => onShutdown(),
    });
    registeredShutdowns.push(() => shutdownHttp());
  }

  if (httpsProxy) {
    const shutdownHttps = gracefulShutdown(httpsProxy, {
      forceExit: false,
      onShutdown: () => onShutdown(),
    });
    registeredShutdowns.push(() => shutdownHttps());
  }
}

/** Actively shut down proxy servers (used by tests and programmatic stop). */
export function endFimiproxy(exitProcess = true): Promise<void> {
  if (shuttingDown) {
    return shuttingDown;
  }

  const {httpProxy, httpsProxy} = getArtifacts();
  const toRun = [...registeredShutdowns];
  registeredShutdowns = [];

  shuttingDown = (async () => {
    if (toRun.length > 0) {
      await Promise.allSettled(toRun.map(fn => fn()));
    } else {
      await Promise.allSettled([
        httpProxy
          ? new Promise<void>((resolve, reject) => {
              httpProxy.close(err => (err ? reject(err) : resolve()));
            })
          : Promise.resolve(),
        httpsProxy
          ? new Promise<void>((resolve, reject) => {
              httpsProxy.close(err => (err ? reject(err) : resolve()));
            })
          : Promise.resolve(),
      ]);
      await cleanupInstance();
    }

    shuttingDown = undefined;

    if (exitProcess) {
      // eslint-disable-next-line no-process-exit
      process.exit();
    }
  })();

  return shuttingDown;
}
