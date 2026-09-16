import {
  request as httpRequest,
  IncomingMessage,
  OutgoingHttpHeaders,
  RequestOptions,
  ServerResponse,
  STATUS_CODES,
} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {pipeline} from 'node:stream/promises';
import {ProxyError} from '../error/ProxyError.js';
import {FimiproxyProtocol} from '../types.js';
import {handleForceRedirect} from './forceRedirect.js';
import {handleForceUpgrade} from './forceUpgrade.js';
import {makeHttpProxyHelpers} from './httpHelpers.js';
import {getActiveInstance} from './instance.js';
import {errorToLogFields, logger} from './logger.js';
import {handleDestinationNotFound} from './notFound.js';
import {getRoundRobinOrigin} from './routes.js';
import {getNewForwardedHost} from './utils.js';
import {getWorkingProxy} from './workingProxy.js';

function safeWriteHead(
  res: ServerResponse,
  statusCode: number,
  statusMessage?: string,
  headers?: OutgoingHttpHeaders,
) {
  if (res.headersSent || res.writableEnded) {
    return false;
  }
  try {
    if (headers !== undefined) {
      res.writeHead(
        statusCode,
        statusMessage || STATUS_CODES[statusCode],
        headers,
      );
    } else if (statusMessage !== undefined) {
      res.writeHead(statusCode, statusMessage);
    } else {
      res.writeHead(statusCode);
    }
    return true;
  } catch (error) {
    logger.error('failed to writeHead', errorToLogFields(error));
    return false;
  }
}

function destroyPeer(
  req: IncomingMessage,
  res: ServerResponse,
  oReq?: ReturnType<typeof httpRequest>,
) {
  try {
    req.destroy();
  } catch {
    // ignore
  }
  try {
    res.destroy();
  } catch {
    // ignore
  }
  try {
    oReq?.destroy();
  } catch {
    // ignore
  }
}

export function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
  protocol: FimiproxyProtocol,
) {
  const instance = getActiveInstance();
  const config = instance?.config;
  const debug = config?.debug;
  const accessLog = config?.accessLog;
  const startedAt = Date.now();
  const proxyHelpers = makeHttpProxyHelpers(res);
  const workingProxy = getWorkingProxy(req, protocol);

  if (handleForceRedirect(workingProxy, proxyHelpers).end) {
    return;
  }

  if (handleDestinationNotFound(workingProxy, proxyHelpers).end) {
    return;
  }

  if (
    handleForceUpgrade(workingProxy, proxyHelpers).end ||
    !workingProxy.destination
  ) {
    return;
  }

  instance?.metrics.onRequestStart();
  let metricsEnded = false;
  const finishMetrics = (statusCode: number) => {
    if (metricsEnded) return;
    metricsEnded = true;
    instance?.metrics.onRequestEnd(statusCode, Date.now() - startedAt);
  };

  const onDone = () => {
    finishMetrics(res.statusCode || 0);
    if (accessLog) {
      logger.info('access', {
        host: workingProxy.host,
        method: req.method,
        url: req.url,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        protocol,
      });
    }
  };
  res.on('finish', onDone);
  res.on('close', onDone);

  const {overrideHost} = workingProxy.destination;
  const origin = getRoundRobinOrigin(workingProxy.destination, 'http:');
  const originStr = origin
    ? `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`
    : 'not found';

  logger.debug('request routed', {
    host: workingProxy.host,
    origin: originStr,
    method: req.method,
    url: req.url,
  });

  if (!origin) {
    proxyHelpers.respondNotFound();
    return;
  }

  const {pathname, search, hash} = workingProxy.incomingURL;
  const agent =
    origin.originProtocol === 'http:'
      ? instance?.agents.httpAgent
      : instance?.agents.httpsAgent;

  const options: RequestOptions = {
    port: origin.originPort,
    host: origin.originHost,
    protocol: origin.originProtocol,
    method: req.method,
    path: pathname + search + hash,
    agent,
    timeout: config?.originTimeoutMs,
    headers: {
      ...req.headers,
      host: overrideHost || req.headers.host,
      'x-forwarded-host': overrideHost || getNewForwardedHost(req),
    },
  };

  if (debug) {
    logger.debug('origin request options', {
      host: workingProxy.host,
      origin: originStr,
      overrideHost,
      method: options.method,
      path: options.path,
    });
  }

  const requestFn =
    origin.originProtocol === 'http:' ? httpRequest : httpsRequest;
  let settled = false;

  const fail = (statusCode: number, error?: unknown) => {
    if (settled) return;
    settled = true;
    instance?.metrics.onOriginError();
    if (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const quiet =
        message.includes('socket hang up') ||
        message.includes('aborted') ||
        message.includes('ECONNRESET');
      const fields = {
        host: workingProxy.host,
        origin: originStr,
        ...errorToLogFields(error),
      };
      if (quiet) {
        logger.debug('proxy request failed', fields);
      } else {
        logger.error('proxy request failed', fields);
      }
    }
    if (!res.headersSent) {
      safeWriteHead(res, statusCode, STATUS_CODES[statusCode], {});
      res.end();
    } else {
      res.destroy();
    }
  };

  const oReq = requestFn(options, oRes => {
    if (!res.headersSent) {
      if (debug) {
        logger.debug('origin response', {
          host: workingProxy.host,
          origin: originStr,
          statusCode: oRes.statusCode,
        });
      }
      safeWriteHead(
        res,
        oRes.statusCode || 200,
        oRes.statusMessage,
        oRes.headers,
      );
    }

    pipeline(oRes, res).catch(error => {
      logger.error('response pipeline error', {
        host: workingProxy.host,
        origin: originStr,
        ...errorToLogFields(error),
      });
      destroyPeer(req, res, oReq);
    });
  });

  oReq.on('timeout', () => {
    oReq.destroy();
    fail(504, new Error('origin timeout'));
  });

  oReq.on('error', error => {
    fail(502, error);
  });

  req.on('error', error => {
    logger.error('client request error', {
      host: workingProxy.host,
      ...errorToLogFields(error),
    });
    destroyPeer(req, res, oReq);
  });

  res.on('error', error => {
    logger.error('client response error', {
      host: workingProxy.host,
      ...errorToLogFields(error),
    });
    destroyPeer(req, res, oReq);
  });

  pipeline(req, oReq).catch(error => {
    // Abort/close during normal end can surface here; only fail if still open.
    if (!settled && !res.writableEnded) {
      fail(502, error);
    }
  });
}

export function wrapHttpProxyHandler(
  fn: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
    protocol: 'http:' | 'https:',
  ) => void | Promise<void>,
  protocol: 'http:' | 'https:',
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
  ) => {
    try {
      await fn(req, res, protocol);
    } catch (error: unknown) {
      let code = 500;
      let proxyError: ProxyError | undefined;

      if (ProxyError.isProxyError(error)) {
        code = error.statusCode;
        proxyError = error;
      }

      if (!res.headersSent) {
        try {
          res.writeHead(code, {'Content-Type': 'text/plain'});
          res.end(STATUS_CODES[code]);
        } catch (writeError) {
          logger.error('error writing proxy error response', {
            ...errorToLogFields(writeError),
          });
          res.destroy();
        }
      } else {
        res.destroy();
      }

      logger.error('error proxying request', {
        protocol,
        assertionMessage: proxyError?.assertionMessage,
        ...errorToLogFields(error),
      });
    }
  };
}
