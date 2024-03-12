import assert from 'node:assert';
import {promises as fsPromises} from 'node:fs';
import {
  IncomingMessage,
  RequestOptions,
  STATUS_CODES,
  Server,
  ServerResponse,
  createServer as createHttpServer,
  request,
} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
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
let artifacts: FimiproxyRuntimeArtifacts = {};
let routes: FimiproxyRoutingMap = {};

function getDestination(req: IncomingMessage) {
  const host = (req.headers.host || '').toLowerCase();
  return routes[host];
}

function proxyIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage> & {
    req: IncomingMessage;
  }
) {
  const destination = getDestination(req);

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

  const oReq = request(options, oRes => {
    res.writeHead(oRes.statusCode || 200, oRes.statusMessage, oRes.headers);
    oRes.on('data', chunk => {
      res.write(chunk);
    });
    oRes.on('end', () => {
      res.end();
    });
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

  req.on('data', chunk => {
    oReq.write(chunk);
  });
  req.on('end', () => {
    oReq.end();
  });
  req.on('error', error => {
    const fAddr = format(req.socket.address);
    console.log(`error with req from ${fAddr}`);
    console.error(error);
    res.writeHead(500, STATUS_CODES[500], {}).end();
  });
}

function proxyIncomingConnect(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer
) {
  const destination = getDestination(req);

  if (!destination) {
    clientSocket.write(
      `HTTP/1.1 404 ${STATUS_CODES[404]}\r\n` + '\r\n',
      'utf-8',
      error => {
        if (error) {
          console.error(error);
        }
      }
    );
    clientSocket.on('error', console.error.bind(console));
    clientSocket.end();
    return;
  }

  const serverSocket = connect(
    destination.originPort,
    destination.originHost,
    () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n' + '\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    }
  );
}

async function createHttpProxy() {
  const proxy = createHttpServer();

  proxy.on('request', proxyIncomingRequest);
  proxy.on('connect', proxyIncomingConnect);
  proxy.on('error', () => {});
  proxy.on('tlsClientError', () => {});
  proxy.on('clientError', () => {});

  return proxy;
}

async function createHttpsProxy(
  httpsPublicKeyFilepath: string,
  httpsPrivateKeyFilepath: string
) {
  const [privateKey, certificate] = await Promise.all([
    fsPromises.readFile(httpsPrivateKeyFilepath, 'utf8'),
    fsPromises.readFile(httpsPublicKeyFilepath, 'utf8'),
  ]);

  const credentials = {key: privateKey, cert: certificate};
  const proxy = createHttpsServer(credentials);

  proxy.on('request', proxyIncomingRequest);
  proxy.on('connect', proxyIncomingConnect);
  proxy.on('error', () => {});
  proxy.on('tlsClientError', () => {});
  proxy.on('clientError', () => {});

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

async function createHttpsProxyUsingConfig(config: FimiproxyRuntimeConfig) {
  if (config.exposeHttpsProxy) {
    assert(
      config.httpsPort,
      'exposeHttpsProxy is true but httpPort not provided'
    );
    assert(
      config.httpsPublicKeyFilepath,
      'exposeHttpProxy is true but httpsPublicKeyFilepath not provided'
    );
    assert(
      config.httpsPrivateKeyFilepath,
      'exposeHttpProxy is true but httpsPrivateKeyFilepath not provided'
    );
    return await createHttpsProxy(
      config.httpsPublicKeyFilepath,
      config.httpsPrivateKeyFilepath
    );
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
    acc[route.incomingHost.toLowerCase()] = route;
    return acc;
  }, {} as FimiproxyRoutingMap);
}

export async function startFimiproxyUsingConfig(
  config: FimiproxyRuntimeConfig,
  shouldHandleGracefulShutdown = true
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
    process.on('SIGINT', endFimiproxy);
    process.on('SIGTERM', endFimiproxy);
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
