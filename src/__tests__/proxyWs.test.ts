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

describe('websocket proxy', () => {
  test.each(['ws:', 'wss:'] as FimiporxyWsProtocol[])(
    'websocket proxy, %s, fails if host not recognized',
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
      ws.on('close', () => closePromise.resolve());

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
      headers: {host: `localhost:${originPort}`},
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
});
