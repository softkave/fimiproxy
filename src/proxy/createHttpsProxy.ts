import assert from 'node:assert';
import {createServer as createHttpsServer} from 'node:https';
import {WebSocketServer} from 'ws';
import {FimiproxyRuntimeConfig, kFimiproxyProtocols} from '../types.js';
import {prepareHttpsCredentials} from './config.js';
import {handleForceRedirect} from './forceRedirect.js';
import {handleDestinationNotFound} from './notFound.js';
import {proxyHttpRequest, wrapHttpProxyHandler} from './proxyHttpRequest.js';
import {proxyWsRequest, proxyWsServer} from './proxyWsRequest.js';
import {getWorkingProxy} from './workingProxy.js';
import {makeWsProxyHelpers} from './wsHelpers.js';

async function createHttpsProxy(params: {
  certificate: string;
  privateKey: string;
  exposeWsProxyForHttps?: boolean;
}) {
  const httpsProxy = createHttpsServer({
    key: params.privateKey,
    cert: params.certificate,
  });
  let wss: WebSocketServer | undefined;

  httpsProxy.on('request', wrapHttpProxyHandler(proxyHttpRequest, 'https:'));
  httpsProxy.on('error', error => {
    console.log('createHttpsProxy error');
    console.error(error);
  });
  httpsProxy.on('tlsClientError', error => {
    console.log('createHttpsProxy tlsClientError');
    console.error(error);
  });
  httpsProxy.on('clientError', error => {
    console.log('createHttpsProxy clientError');
    console.error(error);
  });

  if (params.exposeWsProxyForHttps) {
    wss = new WebSocketServer({noServer: true});
    httpsProxy.on('upgrade', (req, socket, head) => {
      const proxyHelpers = makeWsProxyHelpers(socket);
      const workingProxy = getWorkingProxy(req, kFimiproxyProtocols.wss);
      if (handleForceRedirect(workingProxy, proxyHelpers).end) {
        return;
      }

      if (handleDestinationNotFound(workingProxy, proxyHelpers).end) {
        return;
      }

      wss!.handleUpgrade(req, socket, head, ws => {
        wss!.emit('connection', ws, req);
      });
    });
    proxyWsServer(wss, 'wss:', proxyWsRequest);
  }

  return {httpsProxy, wssProxy: wss};
}

export async function createHttpsProxyUsingConfig(
  config: FimiproxyRuntimeConfig,
) {
  if (config.exposeHttpsProxy) {
    assert(
      config.httpsPort,
      'exposeHttpsProxy is true but httpsPort not provided',
    );

    const credentials = await prepareHttpsCredentials(config);
    assert(
      credentials.key,
      'exposeHttpsProxy is true but httpsPrivateKeyFilepath or httpsPrivateKey not provided',
    );
    assert(
      credentials.cert,
      'exposeHttpsProxy is true but httpsPublicKeyFilepath or httpsPublicKey not provided',
    );

    return await createHttpsProxy({
      certificate: credentials.cert,
      privateKey: credentials.key,
      exposeWsProxyForHttps: config.exposeWsProxyForHttps,
    });
  }

  return undefined;
}
