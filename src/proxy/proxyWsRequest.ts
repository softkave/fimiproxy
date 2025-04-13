import {IncomingMessage} from 'http';
import WebSocket, {WebSocketServer} from 'ws';
import {getDestination, getRoundRobinOrigin} from './routes.js';
import {
  getHostFromRequest,
  getIncomingURL,
  getNewForwardedHost,
} from './utils.js';

export function proxyWsRequest(ws: WebSocket, req: IncomingMessage) {
  const host = getHostFromRequest(req);
  const destination = getDestination(host);
  const incomingURL = getIncomingURL(req);
  const origin = getRoundRobinOrigin(destination, 'ws:');

  console.log(
    `ws: ${host} routed to ${
      origin
        ? `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`
        : 'not found'
    }`,
  );

  if (!origin || !destination) {
    ws.close();
    return;
  }

  const {overrideHost} = destination;
  const {pathname, search, hash} = incomingURL;
  const {originHost, originPort, originProtocol} = origin;
  const url = `${originProtocol}//${originHost}:${originPort}${pathname}${search}${hash}`;
  const targetWs = new WebSocket(url, {
    headers: {
      ...req.headers,
      host: overrideHost || req.headers.host,
      'x-forwarded-host': overrideHost || getNewForwardedHost(req),
    },
  });

  ws.pause();

  targetWs.on('open', () => {
    ws.resume();
  });

  ws.on('message', message => {
    targetWs.send(message);
  });

  targetWs.on('message', message => {
    ws.send(message);
  });

  ws.on('error', error => {
    console.error('ws client error:', error);
  });

  targetWs.on('error', error => {
    console.error('ws target server error:', error);
  });

  ws.on('close', () => {
    targetWs.close();
  });

  targetWs.on('close', () => {
    ws.close();
  });
}

export function proxyWsServer(
  wss: WebSocketServer,
  protocol: 'ws:' | 'wss:',
  fn: (
    ws: WebSocket,
    req: IncomingMessage,
    protocol: 'ws:' | 'wss:',
  ) => void | Promise<void>,
) {
  wss.on('connection', async (ws, req) => {
    try {
      await fn(ws, req, protocol);
    } catch (error: unknown) {
      ws.close();

      console.log(`error proxying req for ${protocol}`);
      console.error(error);
    }
  });
}
