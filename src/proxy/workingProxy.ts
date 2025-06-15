import assert from 'assert';
import {IncomingMessage} from 'http';
import {FimiproxyProtocol, FimiproxyRuntimeConfig} from '../types.js';
import {getArtifacts} from './artifacts.js';
import {getDestination} from './routes.js';
import {WorkingProxy} from './types.js';
import {getHostFromRequest, getIncomingURL} from './utils.js';

export function getWorkingProxy(
  req: IncomingMessage,
  protocol: FimiproxyProtocol,
): WorkingProxy {
  const config = getArtifacts().config;
  assert(config, 'fimiproxy config not set in artifacts');

  const host = getHostFromRequest(req);
  const destination = getDestination(host);
  const incomingURL = getIncomingURL(req);

  return {
    destination: destination || null,
    incomingURL,
    host,
    config: config as unknown as FimiproxyRuntimeConfig,
    protocol,
    end: false,
  };
}
