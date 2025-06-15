import assert from 'node:assert';
import {createServer as createHttpServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {FimiproxyRuntimeConfig, kFimiproxyProtocols} from '../types.js';
import {handleForceRedirect} from './forceRedirect.js';
import {handleForceUpgrade} from './forceUpgrade.js';
import {handleDestinationNotFound} from './notFound.js';
import {proxyHttpRequest, wrapHttpProxyHandler} from './proxyHttpRequest.js';
import {proxyWsRequest, proxyWsServer} from './proxyWsRequest.js';
import {getWorkingProxy} from './workingProxy.js';
import {makeWsProxyHelpers} from './wsHelpers.js';

async function createHttpProxy(params: {exposeWsProxyForHttp?: boolean}) {
  const httpProxy = createHttpServer();
  let wss: WebSocketServer | undefined;

  if (params.exposeWsProxyForHttp) {
    wss = new WebSocketServer({noServer: true});
    httpProxy.on('upgrade', (req, socket, head) => {
      const proxyHelpers = makeWsProxyHelpers(socket);
      const workingProxy = getWorkingProxy(req, kFimiproxyProtocols.ws);
      if (handleForceRedirect(workingProxy, proxyHelpers).end) {
        return;
      }

      if (handleDestinationNotFound(workingProxy, proxyHelpers).end) {
        return;
      }

      if (handleForceUpgrade(workingProxy, proxyHelpers).end) {
        return;
      }

      wss!.handleUpgrade(req, socket, head, ws => {
        wss!.emit('connection', ws, req);
      });
    });
    proxyWsServer(wss, kFimiproxyProtocols.ws, proxyWsRequest);
  }

  httpProxy.on(
    'request',
    wrapHttpProxyHandler(proxyHttpRequest, kFimiproxyProtocols.http),
  );
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
