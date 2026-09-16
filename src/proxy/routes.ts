import assert from 'node:assert';
import {
  FimiproxyRouteItem,
  FimiproxyRoutingMap,
  FimiproxyRuntimeConfig,
} from '../types.js';
import {getActiveInstance} from './instance.js';
import {logger} from './logger.js';
import {pickHealthyOrigins} from './originHealth.js';

export function clearRoutes() {
  const instance = getActiveInstance();
  if (instance) {
    instance.routes = {};
    instance.roundRobin = {};
  }
}

export function getDestination(host: string) {
  host = host.toLowerCase();
  const instance = getActiveInstance();
  return instance?.routes[host];
}

export function getRoundRobinOrigin(
  destination: FimiproxyRouteItem | undefined,
  protocol: 'http:' | 'ws:',
) {
  if (!destination) {
    return undefined;
  }

  const instance = getActiveInstance();
  const origins = instance
    ? pickHealthyOrigins(destination, protocol, instance.originHealth)
    : destination.origin.filter(r => {
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
  const roundRobin = instance?.roundRobin ?? {};
  const index = roundRobin[incomingHostAndPort] || 0;
  const origin = origins[index % originCount];
  if (instance) {
    instance.roundRobin[incomingHostAndPort] = (index + 1) % originCount;
  }
  return origin;
}

export function prepareRoutesFromConfig(config: FimiproxyRuntimeConfig) {
  assert(config.routes, 'routes not configured');
  const instance = getActiveInstance();
  assert(instance, 'fimiproxy instance not active');

  const routes = config.routes.reduce((acc, route) => {
    const incomingHostAndPort = route.incomingHostAndPort.toLowerCase();
    acc[incomingHostAndPort] = route;

    route.origin.forEach(origin => {
      const originTxt = `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`;
      logger.info('route configured', {
        host: incomingHostAndPort,
        origin: originTxt,
      });
    });

    return acc;
  }, {} as FimiproxyRoutingMap);

  instance.routes = routes;
  instance.roundRobin = {};
  instance.originHealth.setRoutes(routes);
}
