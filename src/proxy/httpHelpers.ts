import assert from 'assert';
import {IncomingMessage, ServerResponse, STATUS_CODES} from 'http';
import {getRedirectURL} from './getRedirectURL.js';
import {
  ProxyHelpers,
  ProxyNotFoundFn,
  ProxyRedirectFn,
  ProxyRedirectOverride,
  WorkingProxy,
} from './types.js';

export const httpRespondNotFound = (
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
) => {
  if (!res.headersSent) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end(STATUS_CODES[404]);
  }
};

export const httpRespondRedirect = (
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
  workingProxy: WorkingProxy,
  override?: ProxyRedirectOverride,
) => {
  if (!res.headersSent) {
    const statusCode =
      workingProxy.destination?.usePermanentRedirect ||
      workingProxy.config.usePermanentRedirect
        ? 308
        : 307;
    const url = getRedirectURL(workingProxy, override);
    assert(url, 'No redirect URL found');
    res.writeHead(statusCode, {
      Location: url,
      'Content-Type': 'text/plain',
    });
    res.end(`Redirecting to ${url}`);
  }
};

export function makeHttpRespondNotFound(
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
): ProxyNotFoundFn {
  return () => httpRespondNotFound(res);
}

export function makeHttpRespondRedirect(
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
): ProxyRedirectFn {
  return (workingProxy: WorkingProxy, override?: ProxyRedirectOverride) =>
    httpRespondRedirect(res, workingProxy, override);
}

export const makeHttpProxyHelpers = (
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
): ProxyHelpers => ({
  respondNotFound: makeHttpRespondNotFound(res),
  respondRedirect: makeHttpRespondRedirect(res),
});
