import {faker} from '@faker-js/faker';
import assert from 'assert';
import {OutgoingHttpHeaders} from 'http';
import {getDeferredPromise} from 'softkave-js-utils';
import {afterEach, describe, expect, test} from 'vitest';
import WebSocket, {WebSocketServer} from 'ws';
import {endFimiproxy} from '../proxy/endFimiproxy.js';
import {startFimiproxyUsingConfig} from '../proxy/startFimiproxy.js';
import {
  FimiporxyWsProtocol,
  closeHttpServer,
  createExpressHttpServer,
  generateTestFimiproxyConfig,
  mixAndMatchObject,
} from './testUtils.js';

type TestWsProxyParams = {
  proxyProtocol: FimiporxyWsProtocol;
  originProtocol: FimiporxyWsProtocol;
};

let expressArtifacts:
  | Awaited<ReturnType<typeof createExpressHttpServer>>
  | undefined;

afterEach(async () => {
  await endFimiproxy(false);

  if (expressArtifacts) {
    const {httpServer, httpsServer} = expressArtifacts;
    httpServer && (await closeHttpServer(httpServer));
    httpsServer && (await closeHttpServer(httpsServer));
    expressArtifacts = undefined;
  }
});

describe('proxyWs', () => {
  test.each(['ws:', 'wss:'] as FimiporxyWsProtocol[])(
    'proxy, %s, fails if host not recognized',
    async protocol => {
      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: protocol === 'ws:',
        exposeHttpsProxy: protocol === 'wss:',
        exposeWsProxyForHttp: protocol === 'ws:',
        exposeWsProxyForHttps: protocol === 'wss:',
      });
      await startFimiproxyUsingConfig(config, false);

      const port =
        protocol === 'ws:'
          ? config.httpPort
          : protocol === 'wss:'
            ? config.httpsPort
            : undefined;
      assert(port);

      const reqHeaders: OutgoingHttpHeaders = {host: 'www.google.com:80'};
      const ws = new WebSocket(`${protocol}//localhost:${port}`, {
        headers: reqHeaders,
      });

      ws.on('message', () => {
        assert.fail('should not receive message');
      });

      const closePromise = getDeferredPromise();
      ws.on('error', error => {
        closePromise.resolve();
      });

      await closePromise.promise;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    },
  );

  test.each(
    mixAndMatchObject<TestWsProxyParams>({
      originProtocol: () => ['wss:', 'ws:'],
      proxyProtocol: () => ['wss:', 'ws:'],
    }),
  )('websocket proxy, %j', async params => {
    const {proxyProtocol, originProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'ws:',
      exposeHttpsProxy: proxyProtocol === 'wss:',
      exposeWsProxyForHttp: proxyProtocol === 'ws:',
      exposeWsProxyForHttps: proxyProtocol === 'wss:',
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [
            {
              originPort,
              originProtocol,
              originHost: 'localhost',
            },
          ],
        },
      ],
    });

    await startFimiproxyUsingConfig(config, false);

    // Setup origin WebSocket server
    expressArtifacts = await createExpressHttpServer({
      protocol: originProtocol === 'wss:' ? 'https:' : 'http:',
      httpPort: originPort,
      httpsPort: originPort,
    });
    const {httpServer, httpsServer} = expressArtifacts;
    const server = originProtocol === 'wss:' ? httpsServer : httpServer;
    assert(server);

    const wss = new WebSocketServer({server});
    const testMessage = faker.lorem.sentence();
    const messageReceived = getDeferredPromise<string>();

    wss.on('connection', ws => {
      ws.on('message', message => {
        const messageStr = message.toString();
        ws.send(messageStr); // Echo back the message
      });
    });

    // Connect to proxy
    const proxyPort =
      proxyProtocol === 'ws:'
        ? config.httpPort
        : proxyProtocol === 'wss:'
          ? config.httpsPort
          : undefined;
    assert(proxyPort);

    const ws = new WebSocket(`${proxyProtocol}//localhost:${proxyPort}`, {
      headers: {'x-forwarded-host': `localhost:${originPort}`},
    });

    ws.on('open', () => {
      ws.send(testMessage);
    });

    ws.on('message', message => {
      messageReceived.resolve(message.toString());
    });

    const receivedMessage = await messageReceived.promise;
    expect(receivedMessage).toBe(testMessage);

    ws.close();
    wss.close();
  });

  test('websocket requests are proxied to websocket server not http server', async () => {
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: true,
      exposeWsProxyForHttp: true,
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [
            {
              originPort,
              originProtocol: 'ws:',
              originHost: 'localhost',
            },
            {
              originPort,
              originProtocol: 'http:',
              originHost: 'localhost',
            },
          ],
        },
      ],
    });
    await startFimiproxyUsingConfig(config, false);

    // Setup origin express server with both HTTP and WebSocket servers
    expressArtifacts = await createExpressHttpServer({
      protocol: 'http:',
      httpPort: originPort,
    });
    const {httpServer} = expressArtifacts;
    assert(httpServer);

    // Track HTTP requests
    let httpRequestReceived = false;
    expressArtifacts.app.use((req, res) => {
      httpRequestReceived = true;
      res.status(200).send('HTTP Response');
    });

    // Setup WebSocket server
    const wss = new WebSocketServer({server: httpServer});
    const testMessage = faker.lorem.sentence();
    const messageReceived = getDeferredPromise<string>();

    wss.on('connection', ws => {
      ws.on('message', message => {
        const messageStr = message.toString();
        ws.send(messageStr); // Echo back the message
      });
    });

    // Connect to proxy
    const ws = new WebSocket(`ws://localhost:${config.httpPort}`, {
      headers: {'x-forwarded-host': `localhost:${originPort}`},
    });

    ws.on('open', () => {
      ws.send(testMessage);
    });

    ws.on('message', message => {
      messageReceived.resolve(message.toString());
    });

    const receivedMessage = await messageReceived.promise;
    expect(receivedMessage).toBe(testMessage);
    expect(httpRequestReceived).toBe(false); // Verify no HTTP request was made

    ws.close();
    wss.close();
  });

  test.each([
    {
      config: {
        forceUpgradeHttpToHttps: true,
        usePermanentRedirect: true,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${httpsPort}`;
        },
      },
      destination: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return undefined;
        },
      },
      expectedForceUpgradeHttpToHttps: true,
      name: 'forced upgrade from config with permanent redirect',
    },
    {
      config: {
        forceUpgradeHttpToHttps: true,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${httpsPort}`;
        },
      },
      destination: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return undefined;
        },
      },
      expectedForceUpgradeHttpToHttps: true,
      name: 'forced upgrade from config with temporary redirect',
    },
    {
      config: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${faker.internet.port()}`;
        },
      },
      destination: {
        forceUpgradeHttpToHttps: true,
        usePermanentRedirect: true,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${httpsPort}`;
        },
      },
      expectedForceUpgradeHttpToHttps: true,
      name: 'forced upgrade from destination with permanent redirect',
    },
    {
      config: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${faker.internet.port()}`;
        },
      },
      destination: {
        forceUpgradeHttpToHttps: true,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return `localhost:${httpsPort}`;
        },
      },
      expectedForceUpgradeHttpToHttps: true,
      name: 'forced upgrade from destination with temporary redirect',
    },
    {
      config: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return undefined;
        },
      },
      destination: {
        forceUpgradeHttpToHttps: false,
        usePermanentRedirect: false,
        getHost(httpPort: number, httpsPort: number): string | undefined {
          return undefined;
        },
      },
      expectedForceUpgradeHttpToHttps: false,
      name: 'not forced upgrade',
    },
  ])(
    'upgrades http to https, $name',
    async ({
      config: configParams,
      destination,
      expectedForceUpgradeHttpToHttps,
    }) => {
      const originPort = faker.internet.port();
      const httpPort = faker.internet.port();
      const httpsPort = faker.internet.port();
      const configHost = configParams.getHost(httpPort, httpsPort);
      const destinationHost = destination.getHost(httpPort, httpsPort);
      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: true,
        exposeHttpsProxy: true,
        exposeWsProxyForHttp: true,
        exposeWsProxyForHttps: true,
        forceUpgradeHttpToHttps: configParams.forceUpgradeHttpToHttps,
        usePermanentRedirect: configParams.usePermanentRedirect,
        redirectHost: configHost,
        httpPort: `${httpPort}`,
        httpsPort: `${httpsPort}`,
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {
                originPort,
                originProtocol: 'ws:',
                originHost: 'localhost',
              },
            ],
            forceUpgradeHttpToHttps: destination.forceUpgradeHttpToHttps,
            usePermanentRedirect: destination.usePermanentRedirect,
            redirectHost: destinationHost,
          },
        ],
      });
      await startFimiproxyUsingConfig(config, false);

      // Setup origin WebSocket server
      expressArtifacts = await createExpressHttpServer({
        protocol: 'http:',
        httpPort: originPort,
      });
      const {httpServer} = expressArtifacts;
      assert(httpServer);

      const wss = new WebSocketServer({server: httpServer});
      const testMessage = faker.lorem.sentence();
      const messageReceived = getDeferredPromise<string>();

      wss.on('connection', ws => {
        ws.on('message', message => {
          const messageStr = message.toString();
          ws.send(messageStr); // Echo back the message
        });
      });

      // Connect to proxy using HTTP protocol - should be upgraded if configured
      const initialWsUrl = `ws://localhost:${config.httpPort}/`;
      const ws = new WebSocket(initialWsUrl, {
        headers: {
          'x-forwarded-host': `localhost:${originPort}`,
        },
        followRedirects: true,
      });

      ws.on('open', () => {
        ws.send(testMessage);
      });

      ws.on('message', message => {
        messageReceived.resolve(message.toString());
      });

      const receivedMessage = await messageReceived.promise;
      expect(receivedMessage).toBe(testMessage);

      if (expectedForceUpgradeHttpToHttps) {
        expect(ws.url).toBe(`wss://${destinationHost || configHost}/`);
      } else {
        expect(ws.url).toBe(initialWsUrl);
      }

      ws.close();
      wss.close();
    },
  );

  test('websocket proxy override host', async () => {
    const originPort = faker.internet.port();
    const overrideHost = `localhost:${faker.internet.port()}`;
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: true,
      exposeHttpsProxy: true,
      exposeWsProxyForHttp: true,
      exposeWsProxyForHttps: true,
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [
            {
              originPort,
              originProtocol: 'ws:',
              originHost: 'localhost',
            },
          ],
          overrideHost,
        },
      ],
    });

    await startFimiproxyUsingConfig(config, false);

    // Setup origin WebSocket server
    expressArtifacts = await createExpressHttpServer({
      protocol: 'http:',
      httpPort: originPort,
    });
    const {httpServer} = expressArtifacts;
    assert(httpServer);

    const wss = new WebSocketServer({server: httpServer});
    const testMessage = faker.lorem.sentence();
    const messageReceived = getDeferredPromise<string>();

    wss.on('connection', ws => {
      ws.on('message', message => {
        const messageStr = message.toString();
        ws.send(messageStr); // Echo back the message
      });
    });

    wss.on('headers', (headers, request) => {
      const {rawHeaders} = request;
      const hostHeaderIndex = rawHeaders.findIndex(
        header => header.toLowerCase() === 'host',
      );
      expect(hostHeaderIndex).toBeGreaterThan(-1);
      expect(rawHeaders[hostHeaderIndex + 1]).toBe(overrideHost);
    });

    // Connect to proxy
    const proxyPort = config.httpPort;
    assert(proxyPort);

    const ws = new WebSocket(`ws://localhost:${proxyPort}`, {
      headers: {'x-forwarded-host': `localhost:${originPort}`},
    });

    ws.on('open', () => {
      ws.send(testMessage);
    });

    ws.on('message', message => {
      messageReceived.resolve(message.toString());
    });

    const receivedMessage = await messageReceived.promise;
    expect(receivedMessage).toBe(testMessage);

    ws.close();
    wss.close();
  });

  test.each([
    {
      config: {
        usePermanentRedirect: true,
        getRedirectHost(): string {
          return `redirect.example.com:${faker.internet.port()}`;
        },
      },
      destination: {
        forceRedirect: true,
        usePermanentRedirect: false,
        getRedirectHost(): string | undefined {
          return undefined;
        },
      },
      expectedStatusCode: 308,
      name: 'force redirect with permanent redirect from config',
    },
    {
      config: {
        usePermanentRedirect: false,
        getRedirectHost(): string {
          return `redirect.example.com:${faker.internet.port()}`;
        },
      },
      destination: {
        forceRedirect: true,
        usePermanentRedirect: false,
        getRedirectHost(): string | undefined {
          return undefined;
        },
      },
      expectedStatusCode: 307,
      name: 'force redirect with temporary redirect from config',
    },
    {
      config: {
        usePermanentRedirect: false,
        getRedirectHost(): string {
          return `config.example.com:${faker.internet.port()}`;
        },
      },
      destination: {
        forceRedirect: true,
        usePermanentRedirect: true,
        getRedirectHost(): string {
          return `dest.example.com:${faker.internet.port()}`;
        },
      },
      expectedStatusCode: 308,
      name: 'force redirect with permanent redirect from destination',
    },
    {
      config: {
        usePermanentRedirect: false,
        getRedirectHost(): string {
          return `config.example.com:${faker.internet.port()}`;
        },
      },
      destination: {
        forceRedirect: true,
        usePermanentRedirect: false,
        getRedirectHost(): string {
          return `dest.example.com:${faker.internet.port()}`;
        },
      },
      expectedStatusCode: 307,
      name: 'force redirect with temporary redirect from destination',
    },
    {
      config: {
        usePermanentRedirect: false,
        getRedirectHost(): string | undefined {
          return undefined;
        },
      },
      destination: {
        forceRedirect: true,
        usePermanentRedirect: false,
        getRedirectHost(): string | undefined {
          return undefined;
        },
      },
      expectedStatusCode: 200,
      name: 'force redirect disabled when no redirect host configured',
    },
  ])(
    'handles force redirect flow, $name',
    async ({config: configParams, destination, expectedStatusCode}) => {
      const originPort = faker.internet.port();
      const configRedirectHost = configParams.getRedirectHost();
      const destinationRedirectHost = destination.getRedirectHost();
      const expectedRedirectHost =
        destinationRedirectHost || configRedirectHost;

      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: true,
        exposeWsProxyForHttp: true,
        usePermanentRedirect: configParams.usePermanentRedirect,
        redirectHost: configRedirectHost,
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {originPort, originProtocol: 'ws:', originHost: 'localhost'},
            ],
            forceRedirect: destination.forceRedirect,
            usePermanentRedirect: destination.usePermanentRedirect,
            redirectHost: destinationRedirectHost,
          },
        ],
      });

      await startFimiproxyUsingConfig(config, false);

      // Setup origin WebSocket server for non-redirect cases
      if (expectedStatusCode === 200) {
        expressArtifacts = await createExpressHttpServer({
          protocol: 'http:',
          httpPort: originPort,
        });
        const {httpServer} = expressArtifacts;
        assert(httpServer);

        const wss = new WebSocketServer({server: httpServer});
        const testMessage = faker.lorem.sentence();
        const messageReceived = getDeferredPromise<string>();

        wss.on('connection', ws => {
          ws.on('message', message => {
            const messageStr = message.toString();
            ws.send(messageStr); // Echo back the message
          });
        });

        // Connect to proxy
        const ws = new WebSocket(
          `ws://localhost:${config.httpPort}/test-path`,
          {
            headers: {'x-forwarded-host': `localhost:${originPort}`},
          },
        );

        ws.on('open', () => {
          ws.send(testMessage);
        });

        ws.on('message', message => {
          messageReceived.resolve(message.toString());
        });

        const receivedMessage = await messageReceived.promise;
        expect(receivedMessage).toBe(testMessage);

        ws.close();
        wss.close();
      } else {
        // For redirect cases, we expect the WebSocket connection to fail or be redirected
        const ws = new WebSocket(
          `ws://localhost:${config.httpPort}/test-path`,
          {
            headers: {'x-forwarded-host': `localhost:${originPort}`},
            followRedirects: true,
          },
        );

        const errorPromise = getDeferredPromise();
        ws.on('error', error => {
          errorPromise.resolve();
        });

        ws.on('unexpected-response', (request, response) => {
          expect(response.statusCode).toBe(expectedStatusCode);

          if (expectedStatusCode === 307 || expectedStatusCode === 308) {
            const location = response.headers.location;
            expect(location).toBe(`ws://${expectedRedirectHost}/test-path`);
          }

          errorPromise.resolve();
        });

        await errorPromise.promise;
        expect(ws.readyState).toBe(WebSocket.CLOSED);
      }
    },
  );

  test.each([
    {
      protocol: 'ws:' as FimiporxyWsProtocol,
      expectedRedirectProtocol: 'ws',
      name: 'WS protocol',
    },
    {
      protocol: 'wss:' as FimiporxyWsProtocol,
      expectedRedirectProtocol: 'wss',
      name: 'WSS protocol',
    },
  ])(
    'preserves protocol in force redirect, $name',
    async ({protocol, expectedRedirectProtocol}) => {
      const originPort = faker.internet.port();
      const redirectHost = `redirect.example.com:${faker.internet.port()}`;

      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: protocol === 'ws:',
        exposeHttpsProxy: protocol === 'wss:',
        exposeWsProxyForHttp: protocol === 'ws:',
        exposeWsProxyForHttps: protocol === 'wss:',
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {originPort, originProtocol: protocol, originHost: 'localhost'},
            ],
            forceRedirect: true,
            redirectHost,
          },
        ],
      });

      await startFimiproxyUsingConfig(config, false);

      const proxyPort = protocol === 'ws:' ? config.httpPort : config.httpsPort;
      const ws = new WebSocket(`${protocol}//localhost:${proxyPort}/path`, {
        headers: {
          'x-forwarded-host': `localhost:${originPort}`,
        },
        followRedirects: true,
      });

      const errorPromise = getDeferredPromise();
      ws.on('unexpected-response', (request, response) => {
        expect(response.statusCode).toBe(307);
        const location = response.headers.location;
        expect(location).toBe(
          `${expectedRedirectProtocol}://${redirectHost}/path`,
        );
        errorPromise.resolve();
      });

      ws.on('error', () => {
        errorPromise.resolve();
      });

      await errorPromise.promise;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    },
  );

  test('force redirect preserves URL parts based on redirectURLParts configuration', async () => {
    const originPort = faker.internet.port();
    const redirectHost = `redirect.example.com:${faker.internet.port()}`;

    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: true,
      exposeWsProxyForHttp: true,
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [
            {originPort, originProtocol: 'ws:', originHost: 'localhost'},
          ],
          forceRedirect: true,
          redirectHost,
          redirectURLParts: {
            pathname: true,
            search: false,
            username: false,
            password: false,
          },
        },
      ],
    });

    await startFimiproxyUsingConfig(config, false);

    const ws = new WebSocket(
      `ws://localhost:${config.httpPort}/test/path?query=value&other=param`,
      {
        headers: {
          'x-forwarded-host': `localhost:${originPort}`,
        },
        followRedirects: true,
      },
    );

    const errorPromise = getDeferredPromise();
    ws.on('unexpected-response', (request, response) => {
      expect(response.statusCode).toBe(307);
      const location = response.headers.location;
      // Should preserve pathname but not search params
      expect(location).toBe(`ws://${redirectHost}/test/path`);
      errorPromise.resolve();
    });

    ws.on('error', () => {
      errorPromise.resolve();
    });

    await errorPromise.promise;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
