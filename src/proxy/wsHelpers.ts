import assert from 'assert';
import {STATUS_CODES} from 'http';
import internal from 'stream';
import {getRedirectURL} from './getRedirectURL.js';
import {
  ProxyHelpers,
  ProxyNotFoundFn,
  ProxyRedirectFn,
  ProxyRedirectOverride,
  WorkingProxy,
} from './types.js';

export const wsRespondNotFound = (socket: internal.Duplex) => {
  const headers = [
    `HTTP/1.1 404 ${STATUS_CODES[404]}`,
    'Content-Type: text/plain',
    'Connection: close',
  ];

  socket.write(headers.concat('\r\n').join('\r\n'));
  socket.end();
};

export const wsRespondRedirect = (
  socket: internal.Duplex,
  workingProxy: WorkingProxy,
  override?: ProxyRedirectOverride,
) => {
  const statusCode =
    workingProxy.destination?.usePermanentRedirect ||
    workingProxy.config.usePermanentRedirect
      ? 308
      : 307;
  const url = getRedirectURL(workingProxy, override);
  assert(url, 'No redirect URL found');
  const headers = [
    `HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}`,
    'Content-Type: text/plain',
    'Connection: close',
    `Location: ${url}`,
  ];

  socket.write(headers.concat('\r\n').join('\r\n'));
  socket.end();
};

export function makeWsRespondNotFound(
  socket: internal.Duplex,
): ProxyNotFoundFn {
  return () => wsRespondNotFound(socket);
}

export function makeWsRespondRedirect(
  socket: internal.Duplex,
): ProxyRedirectFn {
  return (workingProxy: WorkingProxy, override?: ProxyRedirectOverride) =>
    wsRespondRedirect(socket, workingProxy, override);
}

export const makeWsProxyHelpers = (socket: internal.Duplex): ProxyHelpers => ({
  respondNotFound: makeWsRespondNotFound(socket),
  respondRedirect: makeWsRespondRedirect(socket),
});
