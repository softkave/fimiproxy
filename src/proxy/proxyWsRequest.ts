import {IncomingMessage} from 'http';
import WebSocket, {WebSocketServer, RawData} from 'ws';
import {getActiveInstance} from './instance.js';
import {errorToLogFields, logger} from './logger.js';
import {getDestination, getRoundRobinOrigin} from './routes.js';
import {
  getHostFromRequest,
  getIncomingURL,
  getNewForwardedHost,
} from './utils.js';

const kWsHighWaterMark = 1024 * 1024; // 1 MiB bufferedAmount pause threshold

function closeBoth(a: WebSocket, b: WebSocket, code?: number, reason?: string) {
  try {
    if (a.readyState === WebSocket.OPEN || a.readyState === WebSocket.CONNECTING) {
      a.close(code, reason);
    }
  } catch {
    // ignore
  }
  try {
    if (b.readyState === WebSocket.OPEN || b.readyState === WebSocket.CONNECTING) {
      b.close(code, reason);
    }
  } catch {
    // ignore
  }
  try {
    a.terminate();
  } catch {
    // ignore
  }
  try {
    b.terminate();
  } catch {
    // ignore
  }
}

function bridgeMessages(from: WebSocket, to: WebSocket) {
  from.on('message', (message: RawData, isBinary: boolean) => {
    if (to.readyState !== WebSocket.OPEN) {
      return;
    }
    if (to.bufferedAmount > kWsHighWaterMark) {
      from.pause();
      const interval = setInterval(() => {
        if (
          to.readyState !== WebSocket.OPEN ||
          to.bufferedAmount <= kWsHighWaterMark / 2
        ) {
          clearInterval(interval);
          from.resume();
        }
      }, 50);
      interval.unref?.();
    }
    to.send(message, {binary: isBinary}, error => {
      if (error) {
        logger.error('ws send error', errorToLogFields(error));
        closeBoth(from, to);
      }
    });
  });
}

export function proxyWsRequest(ws: WebSocket, req: IncomingMessage) {
  const instance = getActiveInstance();
  const config = instance?.config;
  const host = getHostFromRequest(req);
  const destination = getDestination(host);
  const incomingURL = getIncomingURL(req);
  const origin = getRoundRobinOrigin(destination, 'ws:');
  const originStr = origin
    ? `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`
    : 'not found';

  logger.debug('ws routed', {host, origin: originStr});

  if (!origin || !destination) {
    ws.close();
    return;
  }

  instance?.metrics.onWsStart();
  let ended = false;
  const endMetrics = () => {
    if (ended) return;
    ended = true;
    instance?.metrics.onWsEnd();
    if (config?.accessLog) {
      logger.info('ws access', {host, origin: originStr});
    }
  };

  const {overrideHost} = destination;
  const {pathname, search, hash} = incomingURL;
  const {originHost, originPort, originProtocol} = origin;
  const url = `${originProtocol}//${originHost}:${originPort}${pathname}${search}${hash}`;
  const targetWs = new WebSocket(url, {
    handshakeTimeout: config?.originTimeoutMs,
    headers: {
      ...req.headers,
      host: overrideHost || req.headers.host,
      'x-forwarded-host': overrideHost || getNewForwardedHost(req),
    },
  });

  ws.pause();

  const openTimeout = setTimeout(() => {
    logger.error('ws origin open timeout', {host, origin: originStr});
    instance?.metrics.onOriginError();
    closeBoth(ws, targetWs, 1011, 'origin timeout');
    endMetrics();
  }, config?.originTimeoutMs ?? 30_000);
  openTimeout.unref?.();

  targetWs.on('open', () => {
    clearTimeout(openTimeout);
    ws.resume();
    bridgeMessages(ws, targetWs);
    bridgeMessages(targetWs, ws);
  });

  ws.on('error', error => {
    logger.error('ws client error', {host, ...errorToLogFields(error)});
    clearTimeout(openTimeout);
    closeBoth(ws, targetWs);
    endMetrics();
  });

  targetWs.on('error', error => {
    logger.error('ws target error', {
      host,
      origin: originStr,
      ...errorToLogFields(error),
    });
    instance?.metrics.onOriginError();
    clearTimeout(openTimeout);
    closeBoth(ws, targetWs);
    endMetrics();
  });

  ws.on('close', () => {
    clearTimeout(openTimeout);
    try {
      targetWs.close();
    } catch {
      // ignore
    }
    endMetrics();
  });

  targetWs.on('close', () => {
    clearTimeout(openTimeout);
    try {
      ws.close();
    } catch {
      // ignore
    }
    endMetrics();
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
      logger.error('error proxying ws', {
        protocol,
        ...errorToLogFields(error),
      });
    }
  });
}
