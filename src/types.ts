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
}>;

export interface FimiproxyRuntimeArtifacts {
  httpProxy?: Server;
  httpsProxy?: Server;
  wsProxyForHttp?: WebSocketServer;
  wsProxyForHttps?: WebSocketServer;
  config?: FimiproxyRuntimeConfig;
}
