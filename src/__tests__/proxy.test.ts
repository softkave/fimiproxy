import {faker} from '@faker-js/faker';
import assert from 'assert';
import {Request, Response} from 'express';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {endFimiproxy, startFimiproxyUsingConfig} from '../proxy';
import {
  FimiporxyHttpProtocol,
  closeHttpServer,
  createExpressHttpServer,
  generateTestFimiproxyConfig,
  mixAndMatchObject,
  parseHttpMessageFromSocket,
  startHttpConnectCall,
  writeHttpMessageToSocket,
} from './testUtils';

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

describe('proxy', () => {
  test.each(['http:', 'https:'] as FimiporxyHttpProtocol[])(
    'connect, %s, fails if host not recognized',
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

      const {res} = await startHttpConnectCall(
        {port, host: 'localhost'},
        {host: 'www.google.com', path: '/', port: '80'},
        protocol
      );

      expect(res.statusCode).toBe(404);
    }
  );

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
    }
  );

  test.only.each(
    mixAndMatchObject<TestReverseProxyParams>({
      method: () => ['GET'],
      originProtocol: () => ['https:'],
      proxyProtocol: () => ['https:'],
    })
  )('connect, %j', async params => {
    const {proxyProtocol, method, originProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'http:',
      exposeHttpsProxy: proxyProtocol === 'https:',
      routes: [
        {
          originPort,
          originProtocol,
          incomingHostAndPort: `localhost:${originPort}`,
          originHost: 'localhost',
        },
      ],
    });
    await startFimiproxyUsingConfig(config, false);

    const reqPath = '/';
    const reqHeaders: OutgoingHttpHeaders = {host: `localhost:${originPort}`};
    const reqBody = method === 'GET' ? undefined : '';

    const resStatusCode = 200;
    const resHeaders = {'x-tag-text': "i'm not a tea pot"};
    const resBody = 'okay';

    expressArtifacts = await createExpressHttpServer({
      protocol: originProtocol,
      httpPort: originPort,
      httpsPort: originPort,
    });
    const {app} = expressArtifacts;
    const reqHandler = (req: Request, res: Response) => {
      console.log('express server is running!');
      expect(req.headers).toMatchObject(reqHeaders);
      res
        .status(resStatusCode)
        .header(resHeaders)
        .send(req.body || resBody);
    };

    app.use((req, res) => {
      console.log('request got here!');
    });
    app.get('/', reqHandler);
    app.post('/', reqHandler);

    const proxyPort =
      proxyProtocol === 'http:'
        ? config.httpPort
        : proxyProtocol === 'https:'
        ? config.httpsPort
        : undefined;
    assert(proxyPort);

    const {socket, res} = await startHttpConnectCall(
      /** proxy opts */ {port: proxyPort, host: 'localhost'},
      /** origin opts */ {host: 'localhost', path: '/', port: originPort},
      proxyProtocol
    );

    await writeHttpMessageToSocket(
      socket,
      method,
      reqPath,
      reqHeaders as Record<string, string>,
      reqBody
    );
    const {headers, signature, body} = await parseHttpMessageFromSocket(socket);

    assert(signature?.type === 'res');
    expect(signature.statusCode).toBe(resStatusCode.toString());
    expect(body).toBe(resBody);
    expect(headers).toMatchObject(resHeaders);
  });

  test.each(
    mixAndMatchObject<TestReverseProxyParams>({
      method: () => ['GET', 'POST'],
      originProtocol: () => ['http:'],
      proxyProtocol: () => ['http:'],
    })
  )('proxy, %j', async params => {
    const {proxyProtocol, method, originProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'http:',
      exposeHttpsProxy: proxyProtocol === 'https:',
      routes: [
        {
          originPort,
          originProtocol,
          incomingHostAndPort: `localhost:${originPort}`,
          originHost: 'localhost',
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
      protocol: proxyProtocol,
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

    assert(config.httpPort);

    const response = await fetch(
      `http://localhost:${config.httpPort}${reqPath}`,
      {method, body: reqBody, headers: reqHeaders as HeadersInit}
    );
    const actualResBody = await response.text();
    const actualResHeaders = response.headers.raw();

    expect(response.status).toBe(resStatusCode);
    expect(actualResBody).toBe(resBody);
    expect(actualResHeaders).toMatchObject(resHeaders);
  });
});
