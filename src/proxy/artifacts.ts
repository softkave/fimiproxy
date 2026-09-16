import {Server as HttpServer} from 'http';
import {Server as HttpsServer} from 'https';
import {ReadonlyDeep} from 'type-fest';
import {WebSocketServer} from 'ws';
import type {
  FimiproxyRuntimeArtifacts,
  FimiproxyRuntimeConfig,
} from '../types.js';
import {getActiveInstance} from './instance.js';

export function clearArtifacts() {
  // Instance teardown owns cleanup; keep for API compatibility.
}

export function getArtifacts(): ReadonlyDeep<FimiproxyRuntimeArtifacts> {
  const instance = getActiveInstance();
  if (!instance) {
    return {};
  }
  return {
    httpProxy: instance.httpProxy,
    httpsProxy: instance.httpsProxy,
    wsProxyForHttp: instance.wsProxyForHttp,
    wsProxyForHttps: instance.wsProxyForHttps,
    config: instance.config,
  };
}

export function setHttpProxyArtifact(newHttpProxy: HttpServer | undefined) {
  const instance = getActiveInstance();
  if (instance) {
    instance.httpProxy = newHttpProxy;
  }
}

export function setHttpsProxyArtifact(
  newHttpsProxy: HttpServer | HttpsServer | undefined,
) {
  const instance = getActiveInstance();
  if (instance) {
    instance.httpsProxy = newHttpsProxy as HttpsServer | undefined;
  }
}

export function setWsProxyForHttpArtifact(
  newWsProxyForHttp: WebSocketServer | undefined,
) {
  const instance = getActiveInstance();
  if (instance) {
    instance.wsProxyForHttp = newWsProxyForHttp;
  }
}

export function setWsProxyForHttpsArtifact(
  newWsProxyForHttps: WebSocketServer | undefined,
) {
  const instance = getActiveInstance();
  if (instance) {
    instance.wsProxyForHttps = newWsProxyForHttps;
  }
}

export function setConfigArtifact(newConfig: FimiproxyRuntimeConfig) {
  const instance = getActiveInstance();
  if (instance) {
    Object.assign(instance.config, newConfig);
  }
}
