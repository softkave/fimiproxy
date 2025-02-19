import assert from 'node:assert';
import {createServer as createHttpServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {FimiproxyRuntimeConfig} from '../types.js';
import {handleForceUpgradeWs} from './forceUpgrade.js';
import {proxyHttpRequest, wrapHandleHttpProxy} from './proxyHttpRequest.js';
import {proxyWsRequest, proxyWsServer} from './proxyWsRequest.js';

async function createHttpProxy(params: {exposeWsProxyForHttp?: boolean}) {
  const httpProxy = createHttpServer();
  let wss: WebSocketServer | undefined;

  if (params.exposeWsProxyForHttp) {
    wss = new WebSocketServer({noServer: true});
    httpProxy.on('upgrade', (req, socket, head) => {
      const {end} = handleForceUpgradeWs(req, socket, 'ws:');
      if (end) {
        return;
      }

      wss!.handleUpgrade(req, socket, head, ws => {
        wss!.emit('connection', ws, req);
      });
    });
    proxyWsServer(wss, 'ws:', proxyWsRequest);
  }

  httpProxy.on('request', wrapHandleHttpProxy(proxyHttpRequest, 'http:'));
  httpProxy.on('error', error => {
    console.log('createHttpProxy proxy error');
    console.error(error);
  });
  httpProxy.on('tlsClientError', error => {
    console.log('createHttpProxy tlsClientError');
    console.error(error);
  });
  httpProxy.on('clientError', error => {
    console.log('createHttpProxy clientError');
    console.error(error);
  });

  return {httpProxy, wsProxy: wss};
}

export async function createHttpProxyUsingConfig(
  config: FimiproxyRuntimeConfig,
) {
  if (config.exposeHttpProxy) {
    assert(
      config.httpPort,
      'exposeHttpProxy is true but httpPort not provided',
    );

    return await createHttpProxy({
      exposeWsProxyForHttp: config.exposeWsProxyForHttp,
    });
  }

  return undefined;
}
