import {ProxyHelpers, WorkingProxy} from './types.js';

export function handleDestinationNotFound(
  workingProxy: WorkingProxy,
  proxyHelpers: ProxyHelpers,
) {
  if (!workingProxy.destination) {
    proxyHelpers.respondNotFound();
    return {...workingProxy, end: true};
  }

  return {...workingProxy, end: false};
}
