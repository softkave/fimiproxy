import {IncomingMessage} from 'node:http';
import {FimiproxyRoutingMap} from '../types.js';

export function getHostFromRequest(req: IncomingMessage) {
  return req.headers.host || '';
}

export function getDestination(host: string, routes: FimiproxyRoutingMap) {
  host = host.toLowerCase();
  return routes[host];
}
