import assert from 'node:assert';
import {promises as fsPromises} from 'node:fs';
import {Server} from 'node:http';
import {FimiproxyRuntimeConfig} from '../types.js';
import {
  clearArtifacts,
  setConfigArtifact,
  setHttpProxyArtifact,
  setHttpsProxyArtifact,
} from './artifacts.js';
import {createHttpProxyUsingConfig} from './createHttpProxy.js';
import {createHttpsProxyUsingConfig} from './createHttpsProxy.js';
import {endFimiproxy} from './endFimiproxy.js';
import {prepareRoutesFromConfig} from './routes.js';

async function exposeServer(server?: Server, port?: string) {
  return new Promise<void>(resolve => {
    if (server && port) {
      server.listen(port, resolve);
    } else {
      resolve();
    }
  });
}

export async function startFimiproxyUsingConfig(
  config: FimiproxyRuntimeConfig,
  shouldHandleGracefulShutdown = true,
  exitProcessOnShutdown = true,
) {
  clearArtifacts();
  setConfigArtifact(config);
  prepareRoutesFromConfig(config);
  const [httpProxy, httpsProxy] = await Promise.all([
    createHttpProxyUsingConfig(config),
    createHttpsProxyUsingConfig(config),
  ]);

  await Promise.all([
    httpProxy && exposeServer(httpProxy.httpProxy, config.httpPort),
    httpsProxy && exposeServer(httpsProxy.httpsProxy, config.httpsPort),
  ]);

  if (httpProxy) {
    console.log(`http proxy listening on ${config.httpPort}`);
  }

  if (httpsProxy) {
    console.log(`https proxy listening on ${config.httpsPort}`);
  }

  console.log(`process pid: ${process.pid}`);

  setHttpProxyArtifact(httpProxy?.httpProxy);
  setHttpsProxyArtifact(httpsProxy?.httpsProxy);

  // process.on('uncaughtException', (exp, origin) => {
  //   console.log('uncaughtException');
  //   console.error(exp);
  //   console.log(origin);
  // });

  // process.on('unhandledRejection', (reason, promise) => {
  //   console.log('unhandledRejection');
  //   console.log(promise);
  //   console.log(reason);
  // });

  if (shouldHandleGracefulShutdown) {
    endFimiproxy(exitProcessOnShutdown);
  }
}

export async function startFimiproxyUsingConfigFile(filepath: string) {
  const file = await fsPromises.readFile(filepath, 'utf-8');
  const config = JSON.parse(file);
  await startFimiproxyUsingConfig(config);
}

export async function startFimiproxyUsingProcessArgs() {
  const configFilepath = process.argv[2];
  assert(configFilepath, 'fimiproxy config filepath not provided');
  await startFimiproxyUsingConfigFile(configFilepath);
}
