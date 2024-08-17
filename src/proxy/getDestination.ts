import {IncomingMessage} from 'http';
import {FimiproxyRoutingMap} from '../types.js';

export function getDestination(
  req: IncomingMessage,
  routes: FimiproxyRoutingMap
) {
  const host = (req.headers.host || '').toLowerCase();
  return routes[host];
}
