import {FimiproxyRedirectURLSpecificParts} from '../types.js';
import {ProxyRedirectOverride, WorkingProxy} from './types.js';

export function getRedirectURL(
  workingProxy: WorkingProxy,
  override?: ProxyRedirectOverride,
) {
  let redirectHost: string | undefined;
  if (override?.allowRedirectToIncomingHost) {
    // For force upgrades, prefer configured redirectHost over incoming host
    redirectHost =
      workingProxy.destination?.redirectHost ||
      workingProxy.config.redirectHost ||
      workingProxy.incomingURL.host;
  } else {
    redirectHost =
      workingProxy.destination?.redirectHost ||
      workingProxy.config.redirectHost;
  }

  if (!redirectHost) {
    return null;
  }

  const redirectParts =
    workingProxy.destination?.redirectURLParts ||
    workingProxy.config.redirectURLParts;
  const redirectAll = redirectParts === true;
  const redirectSpecificParts: FimiproxyRedirectURLSpecificParts | undefined =
    typeof redirectParts === 'object' && redirectParts !== null
      ? (redirectParts as FimiproxyRedirectURLSpecificParts)
      : redirectAll
        ? {
            pathname: true,
            search: true,
            username: true,
            password: true,
          }
        : // Default to preserving pathname, search, and hash when redirectURLParts is undefined
          {
            pathname: true,
            search: true,
            username: false,
            password: false,
          };

  const redirectURL = new URL(
    `${override?.redirectProtocol || workingProxy.protocol}//${redirectHost}`,
  );

  // Handle URL parts based on their explicit true/false values
  if (redirectSpecificParts) {
    if (redirectSpecificParts.pathname === true) {
      redirectURL.pathname = workingProxy.incomingURL.pathname;
    }
    if (redirectSpecificParts.search === true) {
      redirectURL.search = workingProxy.incomingURL.search;
    } else if (redirectSpecificParts.search === false) {
      redirectURL.search = '';
    }
    if (redirectSpecificParts.username === true) {
      redirectURL.username = workingProxy.incomingURL.username;
    } else if (redirectSpecificParts.username === false) {
      redirectURL.username = '';
    }
    if (redirectSpecificParts.password === true) {
      redirectURL.password = workingProxy.incomingURL.password;
    } else if (redirectSpecificParts.password === false) {
      redirectURL.password = '';
    }
  }

  return redirectURL.toString();
}
