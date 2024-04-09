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
import {connect} from 'node:net';
import {Duplex} from 'node:stream';
import {URL} from 'node:url';
import {format} from 'node:util';
import {
  FimiproxyRoutingMap,
  FimiproxyRuntimeArtifacts,
  FimiproxyRuntimeConfig,
} from './types';

// TODO: make into class so we can have multiple fimiproxy instances
// TODO: prefer https over http when there's both origin servers
// TODO: proper error handling
// TODO: return artifacts from start calls so callers can perform explicit graceful shutdowns
// TODO: add validation checks to config file, and config
// TODO: prevent multiple start calls until transition to class-based encapsulation
// TODO: use http-graceful-shutdown for graceful shutdown implementation
// TODO: what to do about CONNECT calls
// TODO: better and encompassing error logging, usage logging, and metrics logging

let artifacts: FimiproxyRuntimeArtifacts = {};
let routes: FimiproxyRoutingMap = {};

function getDestination(req: IncomingMessage) {
  const host = (req.headers.host || '').toLowerCase();
  return routes[host];
}

function proxyIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {req: IncomingMessage}
) {
  const destination = getDestination(req);
  req.on('error', error => {
    const fAddr = format(req.socket.address);
    console.log(`error with req from ${fAddr}`);
    console.error(error);
    res.writeHead(500, STATUS_CODES[500], {}).end();
  });
  res.on('error', error => {
    const fAddr = format(req.socket.address);
    console.log(`error with res to ${fAddr}`);
    console.error(error);
  });

  const host = (req.headers.host || '').toLowerCase();
  console.log(
    `${host} routed to ${
      destination
        ? `${destination.originProtocol}//${destination.originHost}:${destination.originPort}`
        : 'not found'
    }`
  );

  if (!destination) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end(STATUS_CODES[404]);
    return;
  }

  const reqHeaders = req.headers;
  const incomingUrl = new URL(req.url || '', `http://${reqHeaders.host}`);
  const {pathname, search, hash} = incomingUrl;
  const options: RequestOptions = {
    port: destination.originPort,
    host: destination.originHost,
    protocol: destination.originProtocol,
    method: req.method,
    path: pathname + search + hash,
    headers: req.headers,
  };

  const requestFn =
    destination.originProtocol === 'http:' ? httpRequest : httpsRequest;
  const oReq = requestFn(options, oRes => {
    res.writeHead(oRes.statusCode || 200, oRes.statusMessage, oRes.headers);
    oRes.on('data', chunk => res.write(chunk));
    oRes.on('end', () => res.end());
    oRes.on('error', error => {
      const fAddr = format(oRes.socket?.address);
      const fDestination = format(destination);
      console.log(`error with res from origin ${fAddr} | ${fDestination}`);
      console.error(error);
      res.end();
    });
  });

  oReq.on('error', error => {
    const fAddr = format(oReq.socket?.address);
    const fDestination = format(destination);
    console.log(`error with req to origin ${fAddr} | ${fDestination}`);
    console.error(error);
    res.writeHead(500, STATUS_CODES[500], {}).end();
  });

  req.on('data', chunk => oReq.write(chunk));
  req.on('end', () => oReq.end());
}

function proxyIncomingConnect(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer
) {
  const destination = getDestination(req);
  clientSocket.on('error', console.error.bind(console));
  req.on('error', console.error.bind(console));

  if (!destination) {
    clientSocket.write(
      `HTTP/1.1 404 ${STATUS_CODES[404]}\r\n\r\n`,
      'utf-8',
      error => {
        if (error) {
          console.error(error);
        }
      }
    );
    clientSocket.end();
    return;
  }

  const serverSocket = connect(
    destination.originPort,
    destination.originHost,
    () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    }
  );

  serverSocket.on('error', console.error.bind(console));
}

async function createHttpProxy() {
  const proxy = createHttpServer();

  proxy.on('request', proxyIncomingRequest);

  // TODO: exclude CONNECT from first release because it's a bit slow, there's
  // no use case for it, and testing with an HTTPS origin is unfeasible at the
  // moment
  // proxy.on('connect', proxyIncomingConnect);
  proxy.on('error', console.error.bind(console));
  proxy.on('tlsClientError', console.error.bind(console));
  proxy.on('clientError', console.error.bind(console));

  return proxy;
}

async function createHttpsProxy(certificate: string, privateKey: string) {
  const proxy = createHttpsServer({key: privateKey, cert: certificate});

  proxy.on('request', proxyIncomingRequest);

  // TODO: exclude CONNECT from first release because it's a bit slow, there's
  // no use case for it, and testing with an HTTPS origin is unfeasible at the
  // moment
  // proxy.on('connect', proxyIncomingConnect);
  proxy.on('error', console.error.bind(console));
  proxy.on('tlsClientError', console.error.bind(console));
  proxy.on('clientError', console.error.bind(console));

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
    const originTxt = `${route.originProtocol}//${route.originHost}:${route.originPort}`;
    acc[incomingHostAndPort] = route;
    console.log(`route: ${incomingHostAndPort} > ${originTxt}`);
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
