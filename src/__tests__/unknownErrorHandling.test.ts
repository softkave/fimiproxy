import {faker} from '@faker-js/faker';
import assert from 'assert';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {endFimiproxy, startFimiproxyUsingConfig} from '../proxy';
import {
  FimiporxyHttpProtocol,
  generateTestFimiproxyConfig,
  mixAndMatchObject,
} from './testUtils';

type TestReverseProxyParams = {
  proxyProtocol: FimiporxyHttpProtocol;
};

afterEach(async () => {
  await endFimiproxy(false);
});

vi.mock<typeof import('../proxy/getDestination.js')>(
  import('../proxy/getDestination.js'),
  () => {
    return {
      getDestination: () => {
        throw new Error('TestError');
      },
    };
  }
);

describe('unknownErrorHandling', () => {
  test.each(
    mixAndMatchObject<TestReverseProxyParams>({
      proxyProtocol: () => ['https:', 'http:'],
    })
  )('proxy %j returns 500 if there was unknown error', async params => {
    const {proxyProtocol} = params;
    const originPort = faker.internet.port();
    const config = await generateTestFimiproxyConfig({
      exposeHttpProxy: proxyProtocol === 'http:',
      exposeHttpsProxy: proxyProtocol === 'https:',
      routes: [
        {
          originPort,
          originProtocol: 'http:',
          incomingHostAndPort: `localhost:${originPort}`,
          originHost: 'localhost',
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
      {method: 'GET', headers: reqHeaders as HeadersInit}
    );

    expect(response.status).toBe(500);
  });
});
