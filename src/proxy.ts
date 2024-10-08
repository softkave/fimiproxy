import assert from 'node:assert';
import console from 'node:console';
import {promises as fsPromises} from 'node:fs';
import {
  IncomingMessage,
  RequestOptions,
  STATUS_CODES,
  Server,
  ServerResponse,
  createServer as createHttpServer,
  request as httpRequest,
} from 'node:http';
import {
  createServer as createHttpsServer,
  request as httpsRequest,
} from 'node:https';
import {URL} from 'node:url';
import {format} from 'node:util';
import {BadRequestError} from './error/BadRequestError.js';
import {getDestination} from './proxy/getDestination.js';
import {wrapHandleProxyError} from './proxy/wrapHandleProxyError.js';
import {
  FimiproxyRoutingMap,
  FimiproxyRuntimeArtifacts,
  FimiproxyRuntimeConfig,
} from './types';

let artifacts: FimiproxyRuntimeArtifacts = {};
let routes: FimiproxyRoutingMap = {};
const roundRobin: Record</** incomingHostAndPort */ string, number> = {};

function getRoundRobinOrigin(
  req: IncomingMessage,
  routes: FimiproxyRoutingMap
) {
  const destination = getDestination(req, routes);
  if (!destination) {
    return undefined;
  }

  const origins = destination.origin;
  const originCount = origins.length;
  if (originCount === 0) {
    return undefined;
  }

  const incomingHostAndPort = destination.incomingHostAndPort;
  const index = roundRobin[incomingHostAndPort] || 0;
  const origin = origins[index];
  roundRobin[incomingHostAndPort] = (index + 1) % originCount;
  return {origin, destination};
}

function proxyIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage}
) {
  const destination = getRoundRobinOrigin(req, routes);

  req.on('error', error => {
    const fAddr = format(req.socket.address());
    console.log(`error with req from ${fAddr}`);
    console.error(error);

    if (res.writable) {
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
    }`
  );

  if (!destination) {
    if (res.writable) {
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
    })
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
    if (res.writable) {
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

    if (res.writable) {
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

async function createHttpProxy() {
  const proxy = createHttpServer();

  proxy.on('request', wrapHandleProxyError(proxyIncomingRequest));
  proxy.on('error', error => {
    console.log('createHttpProxy proxy error');
    console.error(error);
  });
  proxy.on('tlsClientError', error => {
    console.log('createHttpProxy tlsClientError');
    console.error(error);
  });
  proxy.on('clientError', error => {
    console.log('createHttpProxy clientError');
    console.error(error);
  });

  return proxy;
}

async function createHttpsProxy(certificate: string, privateKey: string) {
  const proxy = createHttpsServer({key: privateKey, cert: certificate});

  proxy.on('request', wrapHandleProxyError(proxyIncomingRequest));
  proxy.on('error', error => {
    console.log('createHttpsProxy error');
    console.error(error);
  });
  proxy.on('tlsClientError', error => {
    console.log('createHttpsProxy tlsClientError');
    console.error(error);
  });
  proxy.on('clientError', error => {
    console.log('createHttpsProxy clientError');
    console.error(error);
  });

  return proxy;
}

async function createHttpProxyUsingConfig(config: FimiproxyRuntimeConfig) {
  if (config.exposeHttpProxy) {
    assert(
      config.httpPort,
      'exposeHttpProxy is true but httpPort not provided'
    );
    return await createHttpProxy();
  }

  return undefined;
}

async function tryReadFile(filepath?: string) {
  return filepath ? fsPromises.readFile(filepath, 'utf8') : undefined;
}

async function prepareHttpsCredentials(config: FimiproxyRuntimeConfig) {
  const [privateKey, certificate] = await Promise.all([
    config.httpsPrivateKey || tryReadFile(config.httpsPrivateKeyFilepath),
    config.httpsPublicKey || tryReadFile(config.httpsPublicKeyFilepath),
  ]);
  return {key: privateKey, cert: certificate};
}

async function createHttpsProxyUsingConfig(config: FimiproxyRuntimeConfig) {
  if (config.exposeHttpsProxy) {
    assert(
      config.httpsPort,
      'exposeHttpsProxy is true but httpsPort not provided'
    );

    const credentials = await prepareHttpsCredentials(config);
    assert(
      credentials.key,
      'exposeHttpsProxy is true but httpsPrivateKeyFilepath or httpsPrivateKey not provided'
    );
    assert(
      credentials.cert,
      'exposeHttpsProxy is true but httpsPublicKeyFilepath or httpsPublicKey not provided'
    );

    return await createHttpsProxy(credentials.cert, credentials.key);
  }

  return undefined;
}

async function closeProxy(proxy: Server): Promise<void> {
  const addr = proxy.address();
  return new Promise(resolve => {
    proxy.close(error => {
      if (error) {
        console.log(`Error closing proxy for addr ${format(addr)}`);
        console.error(error);
      }

      console.log(`closed ${format(addr)}`);
      resolve();
    });

    proxy.closeAllConnections();
  });
}

export async function endFimiproxy(exitProcess = true) {
  await Promise.all([
    artifacts.httpProxy && closeProxy(artifacts.httpProxy),
    artifacts.httpsProxy && closeProxy(artifacts.httpsProxy),
  ]);
  artifacts = {};
  routes = {};
  console.log('fimiproxy ended');

  if (exitProcess) {
    // eslint-disable-next-line no-process-exit
    process.exit();
  }
}

async function exposeServer(server?: Server, port?: string) {
  return new Promise<void>(resolve => {
    if (server && port) {
      server.listen(port, resolve);
    } else {
      resolve();
    }
  });
}

function prepareRoutesFromConfig(config: FimiproxyRuntimeConfig) {
  assert(config.routes, 'routes not configured');
  routes = config.routes.reduce((acc, route) => {
    const incomingHostAndPort = route.incomingHostAndPort.toLowerCase();
    acc[incomingHostAndPort] = route;

    route.origin.forEach(origin => {
      const originTxt = `${origin.originProtocol}//${origin.originHost}:${origin.originPort}`;
      console.log(`route: ${incomingHostAndPort} > ${originTxt}`);
    });

    return acc;
  }, {} as FimiproxyRoutingMap);
}

export async function startFimiproxyUsingConfig(
  config: FimiproxyRuntimeConfig,
  shouldHandleGracefulShutdown = true,
  exitProcessOnShutdown = true
) {
  prepareRoutesFromConfig(config);
  const [httpProxy, httpsProxy] = await Promise.all([
    createHttpProxyUsingConfig(config),
    createHttpsProxyUsingConfig(config),
  ]);
  await Promise.all([
    exposeServer(httpProxy, config.httpPort),
    exposeServer(httpsProxy, config.httpsPort),
  ]);

  if (httpProxy) {
    console.log(`http proxy listening on ${config.httpPort}`);
  }

  if (httpsProxy) {
    console.log(`https proxy listening on ${config.httpsPort}`);
  }

  console.log(`process pid: ${process.pid}`);

  artifacts = {};
  artifacts.httpProxy = httpProxy;
  artifacts.httpsProxy = httpsProxy;

  // process.on('uncaughtException', (exp, origin) => {
  //   console.log('uncaughtException');
  //   console.error(exp);
  //   console.log(origin);
  // });

  // process.on('unhandledRejection', (reason, promise) => {
  //   console.log('unhandledRejection');
  //   console.log(promise);
  //   console.log(reason);
  // });

  if (shouldHandleGracefulShutdown) {
    process.on('SIGINT', () => endFimiproxy(exitProcessOnShutdown));
    process.on('SIGTERM', () => endFimiproxy(exitProcessOnShutdown));
  }
}

export async function startFimiproxyUsingConfigFile(filepath: string) {
  const file = await fsPromises.readFile(filepath, 'utf-8');
  const config = JSON.parse(file);
  await startFimiproxyUsingConfig(config);
}

export async function startFimiproxyUsingProcessArgs() {
  const configFilepath = process.argv[2];
  assert(configFilepath, 'fimiproxy config filepath not provided');
  await startFimiproxyUsingConfigFile(configFilepath);
}
