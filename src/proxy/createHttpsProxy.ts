import assert from 'node:assert';
import console from 'node:console';
import {createServer as createHttpsServer} from 'node:https';
import {WebSocketServer} from 'ws';
import {FimiproxyRuntimeConfig} from '../types.js';
import {prepareHttpsCredentials} from './config.js';
import {proxyHttpRequest} from './proxyHttpRequest.js';
import {wrapHandleProxyError} from './wrapHandleProxyError.js';
import {proxyWsRequest} from './proxyWsRequest.js';

async function createHttpsProxy(params: {
  certificate: string;
  privateKey: string;
  exposeWsProxyForHttps?: boolean;
}) {
  const proxy = createHttpsServer({
    key: params.privateKey,
    cert: params.certificate,
  });
  let wsProxy: WebSocketServer | undefined;

  if (params.exposeWsProxyForHttps) {
    wsProxy = new WebSocketServer({server: proxy});
    proxyWsRequest(wsProxy);
  }

  proxy.on('request', wrapHandleProxyError(proxyHttpRequest));
  proxy.on('error', error => {
    console.log('createHttpsProxy error');
    console.error(error);
  });
  proxy.on('tlsClientError', error => {
    console.log('createHttpsProxy tlsClientError');
    console.error(error);
  });
  proxy.on('clientError', error => {
    console.log('createHttpsProxy clientError');
    console.error(error);
  });

  return {proxy, wsProxy};
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
