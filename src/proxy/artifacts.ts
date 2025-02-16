import {Server} from 'http';
import {ReadonlyDeep} from 'type-fest';
import {WebSocketServer} from 'ws';
import type {FimiproxyRuntimeArtifacts} from '../types.js';

let artifacts: FimiproxyRuntimeArtifacts = {};

export function clearArtifacts() {
  artifacts = {};
}

export function getArtifacts(): ReadonlyDeep<FimiproxyRuntimeArtifacts> {
  return artifacts;
}

export function setHttpProxyArtifact(newHttpProxy: Server | undefined) {
  artifacts.httpProxy = newHttpProxy;
}

export function setHttpsProxyArtifact(newHttpsProxy: Server | undefined) {
  artifacts.httpsProxy = newHttpsProxy;
}

export function setWsProxyForHttpArtifact(
  newWsProxyForHttp: WebSocketServer | undefined,
) {
  artifacts.wsProxyForHttp = newWsProxyForHttp;
}

export function setWsProxyForHttpsArtifact(
  newWsProxyForHttps: WebSocketServer | undefined,
) {
  artifacts.wsProxyForHttps = newWsProxyForHttps;
}
