import assert from 'node:assert';
import console from 'node:console';
import {createServer as createHttpServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {FimiproxyRuntimeConfig} from '../types.js';
import {proxyHttpRequest} from './proxyHttpRequest.js';
import {proxyWsRequest} from './proxyWsRequest.js';
import {wrapHandleProxyError} from './wrapHandleProxyError.js';

async function createHttpProxy(params: {exposeWsProxyForHttp?: boolean}) {
  const proxy = createHttpServer();
  let wsProxy: WebSocketServer | undefined;

  if (params.exposeWsProxyForHttp) {
    wsProxy = new WebSocketServer({server: proxy});
    proxyWsRequest(wsProxy);
  }

  proxy.on('request', wrapHandleProxyError(proxyHttpRequest));
  proxy.on('error', error => {
    console.log('createHttpProxy proxy error');
    console.error(error);
  });
  proxy.on('tlsClientError', error => {
    console.log('createHttpProxy tlsClientError');
    console.error(error);
  });
  proxy.on('clientError', error => {
    console.log('createHttpProxy clientError');
    console.error(error);
  });

  return {proxy, wsProxy};
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
