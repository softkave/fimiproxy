import {ProxyHelpers, WorkingProxy} from './types.js';

export function handleForceRedirect(
  workingProxy: WorkingProxy,
  proxyHelpers: ProxyHelpers,
) {
  if (workingProxy.destination?.forceRedirect) {
    const redirectHost =
      workingProxy.destination?.redirectHost ||
      workingProxy.config.redirectHost;

    if (!redirectHost) {
      if (workingProxy.config.debug) {
        console.log(
          `No redirect host found for ${workingProxy.host}`,
          workingProxy.destination,
        );
      }
      return {...workingProxy, end: false};
    }

    proxyHelpers.respondRedirect(workingProxy);
    return {...workingProxy, end: true};
  }

  return {...workingProxy, end: false};
}
