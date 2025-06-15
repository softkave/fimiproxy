import {faker} from '@faker-js/faker';
import assert from 'assert';
import {Request, Response} from 'express';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {afterEach, describe, expect, test} from 'vitest';
import {endFimiproxy} from '../proxy/endFimiproxy.js';
import {startFimiproxyUsingConfig} from '../proxy/startFimiproxy.js';
import {
  FimiporxyHttpProtocol,
  closeHttpServer,
  createExpressHttpServer,
  generateTestFimiproxyConfig,
  mixAndMatchObject,
} from './testUtils.js';

type TestReverseProxyParams = {
  proxyProtocol: FimiporxyHttpProtocol;
  method: string;
  originProtocol: FimiporxyHttpProtocol;
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

describe('proxyHttp', () => {
  test.each(['http:', 'https:'] as FimiporxyHttpProtocol[])(
    'proxy, %s, fails if host not recognized',
    async protocol => {
      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: protocol === 'http:',
        exposeHttpsProxy: protocol === 'https:',
      });
      await startFimiproxyUsingConfig(config, false);

      const port =
        protocol === 'http:'
          ? config.httpPort
          : protocol === 'https:'
            ? config.httpsPort
            : undefined;
      assert(port);

      const reqHeaders: OutgoingHttpHeaders = {host: 'www.google.com:80'};
      const response = await fetch(`${protocol}//localhost:${port}`, {
        method: 'GET',
        headers: reqHeaders as HeadersInit,
      });

      expect(response.status).toBe(404);
    },
  );

  test.each(
    mixAndMatchObject<TestReverseProxyParams>({
      method: () => ['GET', 'POST'],
      originProtocol: () => ['https:', 'http:'],
      proxyProtocol: () => ['https:', 'http:'],
    }),
  )('proxy, %j', async params => {
    const {proxyProtocol, method, originProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'http:',
      exposeHttpsProxy: proxyProtocol === 'https:',
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [{originPort, originProtocol, originHost: 'localhost'}],
        },
      ],
    });
    await startFimiproxyUsingConfig(config, false);

    const resStatusCode = 200;
    const resHeaders = {'x-tag-text': ["i'm not a tea pot"]};
    const resBody = faker.lorem.paragraph();

    const reqPath = '/';
    const reqHeaders: OutgoingHttpHeaders = {host: `localhost:${originPort}`};
    const reqBody = method === 'GET' ? undefined : resBody;

    expressArtifacts = await createExpressHttpServer({
      protocol: originProtocol,
      httpPort: originPort,
      httpsPort: originPort,
    });
    const {app} = expressArtifacts;
    const reqHandler = (req: Request, res: Response) => {
      expect(req.headers).toMatchObject(reqHeaders);
      res
        .status(resStatusCode)
        .header(resHeaders)
        .send(req.body || resBody);
    };

    app.get('/', reqHandler);
    app.post('/', reqHandler);

    const proxyPort =
      proxyProtocol === 'http:'
        ? config.httpPort
        : proxyProtocol === 'https:'
          ? config.httpsPort
          : undefined;
    assert(proxyPort);

    const response = await fetch(
      `${proxyProtocol}//localhost:${proxyPort}${reqPath}`,
      {
        method,
        body: reqBody,
        headers: reqHeaders as HeadersInit,
      },
    );
    const actualResBody = await response.text();
    const actualResHeaders = response.headers.raw();

    expect(response.status).toBe(resStatusCode);
    expect(actualResBody).toBe(resBody);
    expect(actualResHeaders).toMatchObject(resHeaders);
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
                originProtocol: expectedForceUpgradeHttpToHttps
                  ? 'https:'
                  : 'http:',
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

      // Setup origin server
      expressArtifacts = await createExpressHttpServer({
        protocol: expectedForceUpgradeHttpToHttps ? 'https:' : 'http:',
        httpPort: originPort,
        httpsPort: originPort,
      });
      const {app} = expressArtifacts;

      const expectedBody = faker.lorem.paragraph();
      app.get('/', (_req, res) => {
        res.send(expectedBody);
      });

      // Handle the test path that the proxy request will forward
      app.get('/test-path', (_req, res) => {
        res.send(expectedBody);
      });

      // Make HTTP request to proxy - it should be upgraded to HTTPS
      const response = await fetch(`http://localhost:${config.httpPort}`, {
        redirect: 'manual',
        headers: {
          host: `localhost:${originPort}`,
        },
      });

      // Verify response
      if (expectedForceUpgradeHttpToHttps) {
        expect(response.status).toBe(
          configParams.usePermanentRedirect || destination.usePermanentRedirect
            ? 308
            : 307,
        );
        const location = response.headers.get('location');
        expect(location).toBe(`https://localhost:${config.httpsPort}/`);

        // Follow redirect
        const redirectResponse = await fetch(location!, {
          headers: {
            host: `localhost:${originPort}`,
          },
        });
        expect(redirectResponse.status).toBe(200);
        const body = await redirectResponse.text();
        expect(body).toBe(expectedBody);
      } else {
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toBe(expectedBody);
      }
    },
  );

  test.each([
    {
      getExistingForwardedHost(originPort: number): string | undefined {
        return undefined;
      },
      getHost(originPort: number): string | undefined {
        return `localhost:${originPort}`;
      },
      getOverrideHost(originPort: number): string | undefined {
        return undefined;
      },
      name: 'no existing forwarded host but host is set',
    },
    {
      getExistingForwardedHost(originPort: number): string | undefined {
        return `localhost:${originPort}`;
      },
      getHost(originPort: number): string | undefined {
        return `localhost:${faker.internet.port()}`;
      },
      getOverrideHost(originPort: number): string | undefined {
        return undefined;
      },
      name: 'existing forwarded host but host is set',
    },
    {
      getExistingForwardedHost(originPort: number): string | undefined {
        return `localhost:${originPort}`;
      },
      getHost(originPort: number): string | undefined {
        return `localhost:${faker.internet.port()}`;
      },
      getOverrideHost(originPort: number): string | undefined {
        return `localhost:${faker.internet.port()}`;
      },
      name: 'existing forwarded host and override host is set',
    },
  ])(
    'sets x-forwarded-host header when proxying requests $name',
    async ({getExistingForwardedHost, getHost, getOverrideHost}) => {
      const originPort = faker.internet.port();
      const existingForwardedHost = getExistingForwardedHost(originPort);
      const host = getHost(originPort);
      const overrideHost = getOverrideHost(originPort);
      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: true,
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {originPort, originProtocol: 'http:', originHost: 'localhost'},
            ],
            overrideHost,
          },
        ],
      });

      await startFimiproxyUsingConfig(config, false);

      const originalHost = host || '';
      let receivedHeaders: any;

      expressArtifacts = await createExpressHttpServer({
        protocol: 'http:',
        httpPort: originPort,
      });
      const {app} = expressArtifacts;

      app.get('/', (req: Request, res: Response) => {
        receivedHeaders = req.headers;
        res.send('ok');
      });

      const fetchResponse = await fetch(`http://localhost:${config.httpPort}`, {
        headers: {
          host: originalHost,
          'x-forwarded-host': existingForwardedHost || '',
        },
      });

      assert(receivedHeaders);
      expect(receivedHeaders['x-forwarded-host']).toBe(
        overrideHost || existingForwardedHost || originalHost,
      );
      expect(receivedHeaders.host).toBe(overrideHost || originalHost);

      if (!host) {
        expect(fetchResponse.status).toBe(404);
      } else {
        expect(fetchResponse.status).toBe(200);
      }
    },
  );

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
        usePermanentRedirect: configParams.usePermanentRedirect,
        redirectHost: configRedirectHost,
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {originPort, originProtocol: 'http:', originHost: 'localhost'},
            ],
            forceRedirect: destination.forceRedirect,
            usePermanentRedirect: destination.usePermanentRedirect,
            redirectHost: destinationRedirectHost,
          },
        ],
      });

      await startFimiproxyUsingConfig(config, false);

      // Setup origin server for non-redirect cases
      const expectedBody = faker.lorem.paragraph();
      if (expectedStatusCode === 200) {
        expressArtifacts = await createExpressHttpServer({
          protocol: 'http:',
          httpPort: originPort,
        });
        const {app} = expressArtifacts;

        app.get('/', (_req, res) => {
          res.send(expectedBody);
        });

        // Handle the test path that the proxy request will forward
        app.get('/test-path', (_req, res) => {
          res.send(expectedBody);
        });
      }

      // Make request to proxy
      const response = await fetch(
        `http://localhost:${config.httpPort}/test-path?param=value`,
        {
          redirect: 'manual',
          headers: {
            host: `localhost:${originPort}`,
          },
        },
      );

      // Verify response
      expect(response.status).toBe(expectedStatusCode);

      if (expectedStatusCode === 307 || expectedStatusCode === 308) {
        // Verify redirect
        const location = response.headers.get('location');
        expect(location).toBe(
          `http://${expectedRedirectHost}/test-path?param=value`,
        );
      } else if (expectedStatusCode === 200) {
        // Verify proxy worked normally
        const body = await response.text();
        expect(body).toBe(expectedBody);
      }
    },
  );

  test.each([
    {
      protocol: 'http:' as FimiporxyHttpProtocol,
      expectedRedirectProtocol: 'http',
      name: 'HTTP protocol',
    },
    {
      protocol: 'https:' as FimiporxyHttpProtocol,
      expectedRedirectProtocol: 'https',
      name: 'HTTPS protocol',
    },
  ])(
    'preserves protocol in force redirect, $name',
    async ({protocol, expectedRedirectProtocol}) => {
      const originPort = faker.internet.port();
      const redirectHost = `redirect.example.com:${faker.internet.port()}`;

      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: protocol === 'http:',
        exposeHttpsProxy: protocol === 'https:',
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

      const proxyPort =
        protocol === 'http:' ? config.httpPort : config.httpsPort;
      const response = await fetch(
        `${protocol}//localhost:${proxyPort}/path?query=test#hash`,
        {
          redirect: 'manual',
          headers: {
            host: `localhost:${originPort}`,
          },
        },
      );

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toBe(
        `${expectedRedirectProtocol}://${redirectHost}/path?query=test`,
      );
    },
  );

  test('force redirect preserves URL parts based on redirectURLParts configuration', async () => {
    const originPort = faker.internet.port();
    const redirectHost = `redirect.example.com:${faker.internet.port()}`;

    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: true,
      routes: [
        {
          incomingHostAndPort: `localhost:${originPort}`,
          origin: [
            {originPort, originProtocol: 'http:', originHost: 'localhost'},
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

    const response = await fetch(
      `http://localhost:${config.httpPort}/test/path?query=value&other=param`,
      {
        redirect: 'manual',
        headers: {
          host: `localhost:${originPort}`,
        },
      },
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    // Should preserve pathname but not search params (hash fragments are not sent to server)
    expect(location).toBe(`http://${redirectHost}/test/path`);
  });
});
