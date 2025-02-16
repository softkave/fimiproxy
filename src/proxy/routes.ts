import assert from 'node:assert';
import {IncomingMessage} from 'node:http';
import {FimiproxyRoutingMap, FimiproxyRuntimeConfig} from '../types.js';
import {getDestination, getHostFromRequest} from './getDestination.js';

let routes: FimiproxyRoutingMap = {};
const roundRobin: Record</** incomingHostAndPort */ string, number> = {};

export function clearRoutes() {
  routes = {};
}

export function getRoundRobinOrigin(
  req: IncomingMessage,
  protocol: 'http:' | 'ws:',
) {
  const destination = getDestination(getHostFromRequest(req), routes);
  if (!destination) {
    return undefined;
  }

  const origins = destination.origin.filter(r => {
    switch (r.originProtocol) {
      case 'http:':
      case 'https:':
        return protocol === 'http:';
      case 'ws:':
      case 'wss:':
        return protocol === 'ws:';
      default:
        return false;
    }
  });

  const originCount = origins.length;
  if (originCount === 0) {
    return undefined;
  }

  const incomingHostAndPort = destination.incomingHostAndPort;
  const index = roundRobin[incomingHostAndPort] || 0;
  const origin = origins[index];
  roundRobin[incomingHostAndPort] = (index + 1) % originCount;
  return {origin, destination};
}

export function prepareRoutesFromConfig(config: FimiproxyRuntimeConfig) {
  assert(config.routes, 'routes not configured');
  routes = config.routes.reduce((acc, route) => {
    const incomingHostAndPort = route.incomingHostAndPort.toLowerCase();
    acc[incomingHostAndPort] = route;

    route.origin.forEach(origin => {
      const originTxt = `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`;
      console.log(`route: ${incomingHostAndPort} > ${originTxt}`);
    });

    return acc;
  }, {} as FimiproxyRoutingMap);
}
