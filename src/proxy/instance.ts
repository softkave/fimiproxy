import {createServer as createHttpServer, Server as HttpServer} from 'node:http';
import {Server as HttpsServer} from 'node:https';
import {WebSocketServer} from 'ws';
import {
  FimiproxyRoutingMap,
  FimiproxyRuntimeConfig,
} from '../types.js';
import {createProxyAgents, ProxyAgents} from './agents.js';
import {ResolvedFimiproxyConfig, resolveConfig} from './defaults.js';
import {logger, configureLogger} from './logger.js';
import {ProxyMetrics} from './metrics.js';
import {OriginHealthTracker} from './originHealth.js';

let activeInstance: FimiproxyInstance | undefined;

export function getActiveInstance(): FimiproxyInstance | undefined {
  return activeInstance;
}

export function setActiveInstance(instance: FimiproxyInstance | undefined) {
  activeInstance = instance;
}

export class FimiproxyInstance {
  readonly config: ResolvedFimiproxyConfig;
  routes: FimiproxyRoutingMap = {};
  roundRobin: Record<string, number> = {};
  readonly agents: ProxyAgents;
  readonly metrics = new ProxyMetrics();
  readonly originHealth: OriginHealthTracker;
  httpProxy?: HttpServer;
  httpsProxy?: HttpsServer;
  wsProxyForHttp?: WebSocketServer;
  wsProxyForHttps?: WebSocketServer;
  private metricsTimer?: NodeJS.Timeout;
  private adminServer?: HttpServer;

  constructor(config: FimiproxyRuntimeConfig, options?: {forceSingleProcess?: boolean}) {
    this.config = resolveConfig(config, options);
    configureLogger(this.config.logLevel);
    this.agents = createProxyAgents(this.config);
    this.originHealth = new OriginHealthTracker(this.config);
  }

  startBackgroundServices() {
    this.originHealth.start();
    if (this.config.metricsEnabled) {
      this.metricsTimer = setInterval(() => {
        logger.info('metrics', this.metrics.snapshot() as unknown as Record<
          string,
          unknown
        >);
      }, this.config.metricsLogIntervalMs);
      this.metricsTimer.unref?.();
    }
    if (this.config.adminPort) {
      this.adminServer = createHttpServer((req, res) => {
        if (req.url === '/metrics' || req.url === '/metrics/') {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(this.metrics.snapshot()));
          return;
        }
        res.writeHead(404).end();
      });
      this.adminServer.listen(
        Number(this.config.adminPort),
        '127.0.0.1',
        () => {
          logger.info('admin metrics listening', {
            port: this.config.adminPort,
            host: '127.0.0.1',
          });
        },
      );
    }
  }

  applyServerLimits(server: HttpServer | HttpsServer) {
    if (this.config.maxConnections > 0) {
      server.maxConnections = this.config.maxConnections;
    }
    server.headersTimeout = this.config.headersTimeoutMs;
    server.requestTimeout = this.config.requestTimeoutMs;
    server.keepAliveTimeout = this.config.keepAliveTimeoutMs;
  }

  async dispose() {
    this.originHealth.stop();
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
    if (this.adminServer) {
      await new Promise<void>(resolve => {
        this.adminServer?.close(() => resolve());
      });
      this.adminServer = undefined;
    }
    this.agents.destroy();
  }
}
