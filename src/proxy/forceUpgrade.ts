import {kFimiproxyProtocols} from '../types.js';
import {ProxyHelpers, WorkingProxy} from './types.js';

export function handleForceUpgrade(
  workingProxy: WorkingProxy,
  proxyHelpers: ProxyHelpers,
) {
  if (!workingProxy.destination) {
    return workingProxy;
  }

  // Add check for force HTTPS upgrade
  if (
    (workingProxy.protocol === kFimiproxyProtocols.http ||
      workingProxy.protocol === kFimiproxyProtocols.ws) &&
    (workingProxy.destination?.forceUpgradeHttpToHttps ||
      workingProxy.config.forceUpgradeHttpToHttps)
  ) {
    const redirectProtocol =
      workingProxy.protocol === kFimiproxyProtocols.ws
        ? kFimiproxyProtocols.wss
        : kFimiproxyProtocols.https;

    proxyHelpers.respondRedirect(workingProxy, {
      redirectProtocol,
      allowRedirectToIncomingHost: true,
    });

    return {...workingProxy, end: true};
  }

  return {...workingProxy, end: false};
}
