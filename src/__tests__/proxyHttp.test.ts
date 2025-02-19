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
      name: 'no existing forwarded host but host is set',
    },
    {
      getExistingForwardedHost(originPort: number): string | undefined {
        return `localhost:${originPort}`;
      },
      getHost(originPort: number): string | undefined {
        return `localhost:${faker.internet.port()}`;
      },
      name: 'existing forwarded host but host is set',
    },
    {
      getExistingForwardedHost(originPort: number): string | undefined {
        return `localhost:${originPort},localhost:${faker.internet.port()}`;
      },
      getHost(originPort: number): string | undefined {
        return `localhost:${faker.internet.port()}`;
      },
      name: 'multiple existing forwarded hosts and host is set',
    },
  ])(
    'sets x-forwarded-host header when proxying requests $name',
    async ({getExistingForwardedHost, getHost, name}) => {
      const originPort = faker.internet.port();
      const existingForwardedHost = getExistingForwardedHost(originPort);
      const host = getHost(originPort);
      const config = await generateTestFimiproxyConfig({
        exposeHttpProxy: true,
        routes: [
          {
            incomingHostAndPort: `localhost:${originPort}`,
            origin: [
              {originPort, originProtocol: 'http:', originHost: 'localhost'},
            ],
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
        existingForwardedHost
          ? `${existingForwardedHost},${originalHost || ''}`
          : originalHost || '',
      );

      if (!host) {
        expect(fetchResponse.status).toBe(404);
      } else {
        expect(fetchResponse.status).toBe(200);
      }
    },
  );
});
