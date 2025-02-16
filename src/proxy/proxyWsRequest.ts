import assert from 'node:assert';
import WebSocket, {WebSocketServer} from 'ws';
import {BadRequestError} from '../error/BadRequestError.js';
import {getRoundRobinOrigin} from './routes.js';

export function proxyWsRequest(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    const destination = getRoundRobinOrigin(req, 'ws:');

    const host = (req.headers.host || '').toLowerCase();
    console.log(
      `ws: ${host} routed to ${
        destination?.origin
          ? `${destination.origin.originProtocol}//${destination.origin.originHost}:${destination.origin.originPort}`
          : 'not found'
      }`,
    );

    if (!destination) {
      ws.close();
      return;
    }

    const reqHeaders = req.headers;
    const incomingURLStr = req.url || '';
    const incomingURLHost = `http://${reqHeaders.host}`;
    const incomingURL = URL.canParse(incomingURLStr, incomingURLHost)
      ? new URL(incomingURLStr, incomingURLHost)
      : undefined;
    assert(
      incomingURL,
      new BadRequestError({
        assertionMessage: `invalid url "${incomingURLStr}", host ${incomingURLHost}`,
      }),
    );

    const {pathname, search, hash} = incomingURL;
    const {originHost, originPort, originProtocol} = destination.origin;
    const url = `${originProtocol}//${originHost}:${originPort}${pathname}${search}${hash}`;
    const targetWs = new WebSocket(url, {headers: reqHeaders});

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
  });
}
