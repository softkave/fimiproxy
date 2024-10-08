import type {Server} from 'http';

export interface FimiproxyRouteItemOrigin {
  originHost: string;
  originPort: number;
  originProtocol: 'http:' | 'https:';
}

export interface FimiproxyRouteItem {
  origin: FimiproxyRouteItemOrigin[];
  incomingHostAndPort: string;
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
  httpsPublicKeyFilepath: string;
  httpsPrivateKeyFilepath: string;
  httpsPublicKey: string;
  httpsPrivateKey: string;
  routes: FimiproxyRouteItem[];
}>;

export interface FimiproxyRuntimeArtifacts {
  httpProxy?: Server;
  httpsProxy?: Server;
}
