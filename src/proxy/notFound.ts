import assert from 'assert';
import {IncomingMessage, ServerResponse, STATUS_CODES} from 'http';
import internal from 'stream';
import {FimiproxyRouteItem, FimiproxyRuntimeConfig} from '../types.js';
import {getArtifacts} from './artifacts.js';
import {getDestination} from './routes.js';
import {getHostFromRequest, getIncomingURL} from './utils.js';

export function handleDestinationNotFound(
  req: IncomingMessage,
  respondNotFound: (
    destination: FimiproxyRouteItem | null,
    config: FimiproxyRuntimeConfig,
  ) => void,
) {
  const config = getArtifacts().config;
  assert(config, 'fimiproxy config not set in artifacts');

  const host = getHostFromRequest(req);
  const destination = getDestination(host);
  const incomingURL = getIncomingURL(req);

  if (!destination) {
    respondNotFound(null, config as FimiproxyRuntimeConfig);
    return {destination, incomingURL, host, config, end: true};
  }

  return {destination, incomingURL, host, config, end: false};
}

export function respondNotFoundHttp(
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
) {
  if (!res.headersSent) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end(STATUS_CODES[404]);
  }
}

export function handleDestinationNotFoundHttp(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
) {
  return handleDestinationNotFound(req, () => respondNotFoundHttp(res));
}

export function respondNotFoundWs(socket: internal.Duplex) {
  const headers = [
    `HTTP/1.1 404 ${STATUS_CODES[404]}`,
    'Content-Type: text/plain',
    'Connection: close',
  ];

  socket.write(headers.concat('\r\n').join('\r\n'));
  socket.end();
}

export function handleDestinationNotFoundWs(
  req: IncomingMessage,
  socket: internal.Duplex,
) {
  return handleDestinationNotFound(req, () => respondNotFoundWs(socket));
}
