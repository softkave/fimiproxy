import type {Server} from 'http';
import type {WebSocketServer} from 'ws';

export interface FimiproxyRouteItemOrigin {
  originHost: string;
  originPort: number;
  originProtocol: 'http:' | 'https:' | 'ws:' | 'wss:';
}

export interface FimiproxyRouteItem {
  origin: FimiproxyRouteItemOrigin[];
  incomingHostAndPort: string;
  forceUpgradeHttpToHttps?: boolean;
  forceUpgradeWsToWss?: boolean;
  usePermanentRedirect?: boolean;
  redirectHost?: string;
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
}>;

export interface FimiproxyRuntimeArtifacts {
  httpProxy?: Server;
  httpsProxy?: Server;
  wsProxyForHttp?: WebSocketServer;
  wsProxyForHttps?: WebSocketServer;
  config?: FimiproxyRuntimeConfig;
}
