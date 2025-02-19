import {faker} from '@faker-js/faker';
import assert from 'assert';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {endFimiproxy} from '../proxy/endFimiproxy.js';
import {startFimiproxyUsingConfig} from '../proxy/startFimiproxy.js';
import {
  FimiporxyHttpProtocol,
  generateTestFimiproxyConfig,
  mixAndMatchObject,
} from './testUtils.js';

type TestReverseProxyParams = {
  proxyProtocol: FimiporxyHttpProtocol;
};

afterEach(async () => {
  await endFimiproxy(false);
});

vi.mock<typeof import('../proxy/routes.js')>(
  import('../proxy/routes.js'),
  async () => {
    const actual = await import('../proxy/routes.js');
    return {
      ...actual,
      getDestination: () => {
        throw new Error('TestError');
      },
    };
  },
);

describe('unknownErrorHandling', () => {
  test.each(
    mixAndMatchObject<TestReverseProxyParams>({
      proxyProtocol: () => ['https:', 'http:'],
    }),
  )('proxy %j returns 500 if there was unknown error', async params => {
    const {proxyProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'http:',
      exposeHttpsProxy: proxyProtocol === 'https:',
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

    const reqPath = '/';
    const reqHeaders: OutgoingHttpHeaders = {host: `localhost:${originPort}`};
    const proxyPort =
      proxyProtocol === 'http:'
        ? config.httpPort
        : proxyProtocol === 'https:'
          ? config.httpsPort
          : undefined;
    assert(proxyPort);

    const response = await fetch(
      `${proxyProtocol}//localhost:${proxyPort}${reqPath}`,
      {method: 'GET', headers: reqHeaders as HeadersInit},
    );

    expect(response.status).toBe(500);
  });
});
