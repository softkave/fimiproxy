import {faker} from '@faker-js/faker';
import assert from 'assert';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {endFimiproxy, startFimiproxyUsingConfig} from '../proxy';
import {
  closeHttpServer,
  createExpressHttpServer,
  generateTestFimiproxyConfig,
  parseHttpMessageFromSocket,
  startHttpConnectCall,
  writeHttpMessageToSocket,
} from './testUtils';

/**
 * - connect, https fails if host not recognized
 * - connect, https
 * - http method, https fails if host not recognized
 * - http method, https
 */

let expressArtifacts:
  | Awaited<ReturnType<typeof createExpressHttpServer>>
  | undefined;

afterEach(async () => {
  await endFimiproxy(false);

  if (expressArtifacts) {
    const {httpServer} = expressArtifacts;
    await closeHttpServer(httpServer);
    expressArtifacts = undefined;
  }
});

describe('proxy', () => {
  test('connect, http, fails if host not recognized', async () => {
    const config = generateTestFimiproxyConfig();
    await startFimiproxyUsingConfig(config, false);

    assert(config.httpPort);
    const {socket} = await startHttpConnectCall(
      {host: 'localhost', port: config.httpPort},
      {host: 'www.google.com', path: '/', port: '80'}
    );

    const {signature} = await parseHttpMessageFromSocket(socket);
    assert(signature?.type === 'res');
    expect(signature.statusCode).toBe(404);
  });

  test('proxy, http, fails if host not recognized', async () => {
    const config = generateTestFimiproxyConfig();
    await startFimiproxyUsingConfig(config, false);

    assert(config.httpPort);
    const reqHeaders: OutgoingHttpHeaders = {host: 'www.google.com:80'};
    const response = await fetch(`http://localhost:${config.httpPort}`, {
      method: 'GET',
      headers: reqHeaders as HeadersInit,
    });

    expect(response.status).toBe(404);
  });

  test.each(['GET', 'POST'])('connect, http %s', async method => {
    const config = generateTestFimiproxyConfig();
    await startFimiproxyUsingConfig(config, false);

    const originPort = faker.internet.port();
    const reqPath = '/';
    const reqHeaders: OutgoingHttpHeaders = {host: `localhost:${originPort}`};
    const reqBody = method === 'GET' ? undefined : '';

    const resStatusCode = 200;
    const resHeaders = {};
    const resBody = 'okay';

    expressArtifacts = await createExpressHttpServer(originPort);
    const {app, httpServer} = expressArtifacts;
    app.get('/', (req, res) => {
      expect(reqHeaders).toMatchObject(req.headers);
      res.status(resStatusCode).header(resHeaders).send(resBody);
    });

    assert(config.httpPort);
    const {socket} = await startHttpConnectCall(
      {host: 'localhost', port: config.httpPort},
      {host: 'localhost', path: '/', port: originPort}
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
    expect(signature.statusCode).toBe(resStatusCode);
    expect(body).toBe(resBody);
    expect(headers).toMatchObject(reqHeaders);

    httpServer.close();
  });

  test.each(['GET', 'POST'])('proxy, http %s', async method => {
    const config = generateTestFimiproxyConfig();
    await startFimiproxyUsingConfig(config, false);

    const originPort = faker.internet.port();
    const reqPath = '/';
    const reqHeaders: OutgoingHttpHeaders = {host: `localhost:${originPort}`};
    const reqBody = method === 'GET' ? undefined : '';

    const resStatusCode = 200;
    const resHeaders = {};
    const resBody = 'okay';

    expressArtifacts = await createExpressHttpServer(originPort);
    const {app, httpServer} = expressArtifacts;
    app.get('/', (req, res) => {
      expect(reqHeaders).toMatchObject(req.headers);
      res.status(resStatusCode).header(resHeaders).send(resBody);
    });

    assert(config.httpPort);

    const response = await fetch(
      `http://localhost:${config.httpPort}${reqPath}`,
      {method, body: reqBody, headers: reqHeaders as HeadersInit}
    );
    const actualResBody = await response.text();
    const actualResHeaders = response.headers;

    expect(response.status).toBe(resStatusCode);
    expect(actualResBody).toBe(resBody);
    expect(actualResHeaders).toMatchObject(reqHeaders);

    httpServer.close();
  });
});
