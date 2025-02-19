import {IncomingMessage, ServerResponse, STATUS_CODES} from 'http';
import internal from 'stream';
import {FimiproxyRouteItem, FimiproxyRuntimeConfig} from '../types.js';
import {handleDestinationNotFound} from './notFound.js';

export function handleForceUpgrade(
  req: IncomingMessage,
  protocol: 'http:' | 'https:' | 'ws:' | 'wss:',
  respondNotFound: (
    destination: FimiproxyRouteItem | null,
    config: FimiproxyRuntimeConfig,
  ) => void,
  respondRedirect: (
    url: string,
    destination: FimiproxyRouteItem | null,
    config: FimiproxyRuntimeConfig,
  ) => void,
) {
  const {destination, incomingURL, host, config, end} =
    handleDestinationNotFound(req, respondNotFound);

  if (end || !destination) {
    return {destination, incomingURL, host, config, end};
  }

  // Add check for force HTTPS upgrade
  if (
    (protocol === 'http:' || protocol === 'ws:') &&
    (destination?.forceUpgradeHttpToHttps || config.forceUpgradeHttpToHttps)
  ) {
    const redirectHost =
      destination?.redirectHost || config.redirectHost || host;
    const redirectProtocol = protocol === 'ws:' ? 'wss:' : 'https:';
    const redirectURL = new URL(
      `${redirectProtocol}//${redirectHost}${incomingURL.pathname}`,
    );

    respondRedirect(
      redirectURL.toString(),
      destination,
      config as FimiproxyRuntimeConfig,
    );
    return {destination, incomingURL, host, end: true};
  }

  return {destination, incomingURL, host, end: false};
}

export function handleForceUpgradeHttp(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
  protocol: 'http:' | 'https:',
) {
  const respondNotFound = () => {
    if (!res.headersSent) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end(STATUS_CODES[404]);
    }
  };

  const respondRedirect = (
    url: string,
    destination: FimiproxyRouteItem | null,
    config: FimiproxyRuntimeConfig,
  ) => {
    if (!res.headersSent) {
      const statusCode =
        destination?.usePermanentRedirect || config.usePermanentRedirect
          ? 308
          : 307;
      res.writeHead(statusCode, {
        Location: url,
        'Content-Type': 'text/plain',
      });
      res.end(`Redirecting to ${url}`);
    }
  };

  return handleForceUpgrade(req, protocol, respondNotFound, respondRedirect);
}

export function handleForceUpgradeWs(
  req: IncomingMessage,
  socket: internal.Duplex,
  protocol: 'ws:' | 'wss:',
) {
  const respondNotFound = () => {
    const headers = [
      `HTTP/1.1 404 ${STATUS_CODES[404]}`,
      'Content-Type: text/plain',
      'Connection: close',
    ];

    socket.write(headers.concat('\r\n').join('\r\n'));
    socket.end();
  };

  const respondRedirect = (
    url: string,
    destination: FimiproxyRouteItem | null,
    config: FimiproxyRuntimeConfig,
  ) => {
    const statusCode =
      destination?.usePermanentRedirect || config.usePermanentRedirect
        ? 308
        : 307;
    const headers = [
      `HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}`,
      'Content-Type: text/plain',
      'Connection: close',
      `Location: ${url}`,
    ];

    socket.write(headers.concat('\r\n').join('\r\n'));
    socket.end();
  };

  return handleForceUpgrade(req, protocol, respondNotFound, respondRedirect);
}
