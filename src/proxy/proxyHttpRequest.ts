import {
  request as httpRequest,
  IncomingMessage,
  RequestOptions,
  ServerResponse,
  STATUS_CODES,
} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {format} from 'node:util';
import {ProxyError} from '../error/ProxyError.js';
import {getArtifacts} from './artifacts.js';
import {handleForceUpgradeHttp} from './forceUpgrade.js';
import {respondNotFoundHttp} from './notFound.js';
import {getRoundRobinOrigin} from './routes.js';
import {getNewForwardedHost} from './utils.js';

export function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
  protocol: 'http:' | 'https:',
) {
  const {config} = getArtifacts();
  const {debug} = config || {};
  const {destination, incomingURL, host, end} = handleForceUpgradeHttp(
    req,
    res,
    protocol,
  );

  if (end || !destination) {
    return;
  }

  req.on('error', error => {
    const fAddr = format(req.socket.address());
    console.log(`Error with req from ${fAddr}`);
    console.error(error);

    if (!res.headersSent) {
      res.writeHead(500, STATUS_CODES[500], {}).end();
    }
  });

  res.on('error', error => {
    const fAddr = format(req.socket.address());
    console.log(`Error with res to ${fAddr}`);
    console.error(error);
    // TODO: if there's an error who ends res?
  });

  const {overrideHost} = destination;
  const origin = getRoundRobinOrigin(destination, 'http:');
  const originStr = origin
    ? `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`
    : 'not found';
  console.log(`${host} routed to ${originStr}`);

  if (!origin) {
    if (debug) {
      console.log('Request Host: ', host);
      console.log('Error: Origin not found');
      console.dir({headers: req.headers}, {depth: null});
    }

    respondNotFoundHttp(res);
    return;
  }

  const {pathname, search, hash} = incomingURL;
  const options: RequestOptions = {
    port: origin.originPort,
    host: origin.originHost,
    protocol: origin.originProtocol,
    method: req.method,
    path: pathname + search + hash,
    headers: {
      ...req.headers,
      host: overrideHost || req.headers.host,
      'x-forwarded-host': overrideHost || getNewForwardedHost(req),
    },
  };

  if (debug) {
    console.log('Request Host: ', host);
    console.log('Request Origin: ', originStr);
    console.log('Request Override Host: ', overrideHost);
    console.dir(options, {depth: null});
  }

  const requestFn =
    origin.originProtocol === 'http:' ? httpRequest : httpsRequest;
  const oReq = requestFn(options, oRes => {
    if (!res.headersSent) {
      if (debug) {
        console.log('Response Host: ', host);
        console.log('Response Origin: ', originStr);
        console.log('Response Override Host: ', overrideHost);
        console.dir(
          {
            statusCode: oRes.statusCode,
            statusMessage: oRes.statusMessage,
            headers: oRes.headers,
          },
          {depth: null},
        );
      }

      res.writeHead(oRes.statusCode || 200, oRes.statusMessage, oRes.headers);
    }

    oRes.on('data', chunk => {
      if (res.writable) {
        res.write(chunk);
      }
    });

    oRes.on('end', () => res.end());
    oRes.on('error', error => {
      const fAddr = format(oRes.socket?.address());
      const fDestination = format(destination);
      console.log(`Error with res from origin ${fAddr} | ${fDestination}`);
      console.error(error);
      res.end();
    });
  });

  oReq.on('error', error => {
    const fAddr = format(oReq.socket?.address());
    const fDestination = format(destination);
    console.log(`Error with req to origin ${fAddr} | ${fDestination}`);
    console.error(error);

    if (!res.headersSent) {
      res.writeHead(500, STATUS_CODES[500], {}).end();
    }
  });

  req.on('data', chunk => {
    if (oReq.writable) {
      oReq.write(chunk);
    }
  });

  req.on('end', () => oReq.end());
  // TODO: what happens with oReq on req.on("error")
}

export function wrapHandleHttpProxy(
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

      res.writeHead(code, {'Content-Type': 'text/plain'});
      res.end(STATUS_CODES[code]);

      console.log(`Error proxying req for ${protocol}`);
      if (proxyError?.assertionMessage) {
        console.log(proxyError?.assertionMessage);
      }

      console.error(error);
    }
  };
}
