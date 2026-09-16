import type {Server} from 'http';
import type {WebSocketServer} from 'ws';

export const kFimiproxyProtocols = {
  http: 'http:',
  https: 'https:',
  ws: 'ws:',
  wss: 'wss:',
} as const;

export type FimiproxyProtocol =
  (typeof kFimiproxyProtocols)[keyof typeof kFimiproxyProtocols];

export type FimiproxyLogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface FimiproxyRouteItemOrigin {
  originHost: string;
  originPort: number;
  originProtocol: FimiproxyProtocol;
}

export interface FimiproxyRedirectURLSpecificParts {
  protocol?: FimiproxyProtocol;
  pathname?: boolean;
  search?: boolean;
  username?: boolean;
  password?: boolean;
}

/**
 * If true, the proxy will redirect the request to the redirectHost. This is
 * useful for migrating to a new host.
 *
 * If an object, the proxy will redirect the request to the redirectHost with
 * the specified parts.
 */
export type FimiproxyRedirectURLParts =
  | FimiproxyRedirectURLSpecificParts
  | boolean;

export interface FimiproxyRouteItem {
  origin: FimiproxyRouteItemOrigin[];
  incomingHostAndPort: string;
  forceUpgradeHttpToHttps?: boolean;
  forceUpgradeWsToWss?: boolean;
  /**
   * If set, the proxy will redirect the request to the redirectHost. This is
   * useful for migrating to a new host.
   */
  forceRedirect?: boolean;
  usePermanentRedirect?: boolean;
  redirectHost?: string;
  redirectURLParts?: FimiproxyRedirectURLParts;
  /**
   * If set, the proxy will override the host in the request sent to the origin.
   * This is useful for testing purposes, or when a specific host is needed,
   * like for OAuth.
   */
  overrideHost?: string;
}

export type FimiproxyRoutingMap = Record<
  /** incomingHost */ string,
  FimiproxyRouteItem | undefined
>;

export type FimiproxyRuntimeConfig = Partial<{
  exposeHttpProxy: boolean;
  httpPort: string;
  exposeHttpsProxy: boolean;
  httpsPort: string;
  exposeWsProxyForHttp: boolean;
  exposeWsProxyForHttps: boolean;
  httpsPublicKeyFilepath: string;
  httpsPrivateKeyFilepath: string;
  httpsPublicKey: string;
  httpsPrivateKey: string;
  routes: FimiproxyRouteItem[];
  forceUpgradeHttpToHttps: boolean;
  forceUpgradeWsToWss: boolean;
  usePermanentRedirect: boolean;
  redirectHost: string;
  redirectURLParts: FimiproxyRedirectURLParts;
  debug: boolean;
  /** Number of cluster worker processes. Default: os.availableParallelism(). Use 1 for single-process. */
  workers: number;
  /** Timeout for origin request / WS open in ms. Default: 30000. */
  originTimeoutMs: number;
  /** Incoming headers timeout in ms. Default: 60000. */
  headersTimeoutMs: number;
  /** Incoming request timeout in ms. 0 = disabled. Default: 0. */
  requestTimeoutMs: number;
  /** Incoming keep-alive timeout in ms. Default: 5000. */
  keepAliveTimeoutMs: number;
  /** Max sockets per origin host for outbound keep-alive agent. Default: 256. */
  maxSockets: number;
  /** Max free sockets retained by outbound agent. Default: 256. */
  maxFreeSockets: number;
  /** Max concurrent inbound connections (0 = unlimited). Default: 0. */
  maxConnections: number;
  /** Emit structured per-request access logs. Default: false. */
  accessLog: boolean;
  /** Structured log level. Default: info (debug if debug=true). */
  logLevel: FimiproxyLogLevel;
  /** Enable periodic TCP health checks for origins. Default: false. */
  originHealthEnabled: boolean;
  /** Origin health check interval in ms. Default: 10000. */
  originHealthIntervalMs: number;
  /** Periodically log metrics snapshot. Default: false. */
  metricsEnabled: boolean;
  /** Metrics log interval in ms. Default: 60000. */
  metricsLogIntervalMs: number;
  /** Localhost-only admin HTTP port for GET /metrics. */
  adminPort: string;
}>;

export interface FimiproxyRuntimeArtifacts {
  httpProxy?: Server;
  httpsProxy?: Server;
  wsProxyForHttp?: WebSocketServer;
  wsProxyForHttps?: WebSocketServer;
  config?: FimiproxyRuntimeConfig;
}
