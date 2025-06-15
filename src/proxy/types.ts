import {
  FimiproxyProtocol,
  FimiproxyRouteItem,
  FimiproxyRuntimeConfig,
} from '../types.js';

export type ProxyNotFoundFn = () => void;

export interface ProxyRedirectOverride {
  redirectProtocol?: FimiproxyProtocol;
  /** Useful for force upgrade to https */
  allowRedirectToIncomingHost?: boolean;
}

export type ProxyRedirectFn = (
  workingProxy: WorkingProxy,
  override?: ProxyRedirectOverride,
) => void;

export interface ProxyHelpers {
  respondNotFound: ProxyNotFoundFn;
  respondRedirect: ProxyRedirectFn;
}

export interface WorkingProxy {
  destination: FimiproxyRouteItem | null;
  incomingURL: URL;
  host: string;
  config: FimiproxyRuntimeConfig;
  protocol: FimiproxyProtocol;
  end: boolean;
}
