import assert from 'assert';
import {
  request as httpRequest,
  IncomingMessage,
  RequestOptions,
  ServerResponse,
  STATUS_CODES,
} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {format} from 'node:util';
import {BadRequestError} from '../error/BadRequestError.js';
import {getRoundRobinOrigin} from './routes.js';

export function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage},
) {
  const destination = getRoundRobinOrigin(req, 'http:');

  req.on('error', error => {
    const fAddr = format(req.socket.address());
    console.log(`error with req from ${fAddr}`);
    console.error(error);

    if (!res.headersSent) {
      res.writeHead(500, STATUS_CODES[500], {}).end();
    }
  });

  res.on('error', error => {
    const fAddr = format(req.socket.address());
    console.log(`error with res to ${fAddr}`);
    console.error(error);
    // TODO: if there's an error who ends res?
  });

  const host = (req.headers.host || '').toLowerCase();
  console.log(
    `${host} routed to ${
      destination?.origin
        ? `${destination.origin.originProtocol}//${destination.origin.originHost}:${destination.origin.originPort}`
        : 'not found'
    }`,
  );

  if (!destination) {
    if (!res.headersSent) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end(STATUS_CODES[404]);
    }

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
  const options: RequestOptions = {
    port: destination.origin.originPort,
    host: destination.origin.originHost,
    protocol: destination.origin.originProtocol,
    method: req.method,
    path: pathname + search + hash,
    headers: req.headers,
  };

  const requestFn =
    destination.origin.originProtocol === 'http:' ? httpRequest : httpsRequest;
  const oReq = requestFn(options, oRes => {
    if (!res.headersSent) {
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
      console.log(`error with res from origin ${fAddr} | ${fDestination}`);
      console.error(error);
      res.end();
    });
  });

  oReq.on('error', error => {
    const fAddr = format(oReq.socket?.address());
    const fDestination = format(destination);
    console.log(`error with req to origin ${fAddr} | ${fDestination}`);
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
