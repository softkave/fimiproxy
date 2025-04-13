import assert from 'node:assert';
import {IncomingMessage} from 'node:http';
import {BadRequestError} from '../error/BadRequestError.js';

export function getHostFromRequest(req: IncomingMessage) {
  const forwardedHost = req.headers['x-forwarded-host'];
  let host: string | undefined;

  if (typeof forwardedHost === 'string' && forwardedHost) {
    host = forwardedHost;
  } else {
    host = req.headers.host;
  }

  return host || '';
}

export function getIncomingURL(req: IncomingMessage) {
  const host = getHostFromRequest(req);
  const incomingURLStr = req.url || '';
  const incomingURL = URL.canParse(incomingURLStr, `http://${host}`)
    ? new URL(incomingURLStr, `http://${host}`)
    : undefined;

  assert(
    incomingURL,
    new BadRequestError({
      assertionMessage: `invalid url "${incomingURLStr}", host ${host}`,
    }),
  );

  return incomingURL;
}

export function getNewForwardedHost(req: IncomingMessage) {
  const incomingForwardedHost = req.headers['x-forwarded-host'];
  const incomingHost = req.headers.host;
  const newForwardedHost = incomingForwardedHost || incomingHost;
  if (Array.isArray(newForwardedHost)) {
    return newForwardedHost[0];
  }

  return newForwardedHost;
}
