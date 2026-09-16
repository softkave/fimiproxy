import {createConnection} from 'node:net';
import {
  FimiproxyRouteItem,
  FimiproxyRouteItemOrigin,
  FimiproxyRoutingMap,
} from '../types.js';
import {ResolvedFimiproxyConfig} from './defaults.js';
import {errorToLogFields, logger} from './logger.js';

function originKey(origin: FimiproxyRouteItemOrigin) {
  return `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`;
}

export class OriginHealthTracker {
  private readonly unhealthy = new Set<string>();
  private timer?: NodeJS.Timeout;
  private readonly config: ResolvedFimiproxyConfig;
  private routes: FimiproxyRoutingMap = {};

  constructor(config: ResolvedFimiproxyConfig) {
    this.config = config;
  }

  setRoutes(routes: FimiproxyRoutingMap) {
    this.routes = routes;
  }

  start() {
    if (!this.config.originHealthEnabled) {
      return;
    }
    this.stop();
    void this.checkAll();
    this.timer = setInterval(() => {
      void this.checkAll();
    }, this.config.originHealthIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  isHealthy(origin: FimiproxyRouteItemOrigin) {
    if (!this.config.originHealthEnabled) {
      return true;
    }
    return !this.unhealthy.has(originKey(origin));
  }

  private async checkAll() {
    const origins = new Map<string, FimiproxyRouteItemOrigin>();
    for (const route of Object.values(this.routes)) {
      if (!route) continue;
      for (const origin of route.origin) {
        origins.set(originKey(origin), origin);
      }
    }

    await Promise.all(
      [...origins.values()].map(origin => this.checkOrigin(origin)),
    );
  }

  private checkOrigin(origin: FimiproxyRouteItemOrigin) {
    const key = originKey(origin);
    return new Promise<void>(resolve => {
      const socket = createConnection({
        host: origin.originHost,
        port: origin.originPort,
      });
      const timeout = setTimeout(() => {
        socket.destroy();
        this.mark(key, false);
        resolve();
      }, Math.min(5_000, this.config.originTimeoutMs));

      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.end();
        this.mark(key, true);
        resolve();
      });
      socket.once('error', error => {
        clearTimeout(timeout);
        logger.debug('origin health check failed', {
          origin: key,
          ...errorToLogFields(error),
        });
        this.mark(key, false);
        resolve();
      });
    });
  }

  private mark(key: string, healthy: boolean) {
    const wasUnhealthy = this.unhealthy.has(key);
    if (healthy) {
      if (wasUnhealthy) {
        this.unhealthy.delete(key);
        logger.info('origin healthy', {origin: key});
      }
    } else if (!wasUnhealthy) {
      this.unhealthy.add(key);
      logger.warn('origin unhealthy', {origin: key});
    }
  }
}

export function pickHealthyOrigins(
  destination: FimiproxyRouteItem,
  protocol: 'http:' | 'ws:',
  health: OriginHealthTracker,
) {
  const matching = destination.origin.filter(r => {
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

  const healthy = matching.filter(o => health.isHealthy(o));
  // Fall back to all matching origins if every origin is marked unhealthy so
  // traffic is not hard-stopped by a transient health flap.
  return healthy.length > 0 ? healthy : matching;
}
