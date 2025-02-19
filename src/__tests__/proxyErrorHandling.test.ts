import {faker} from '@faker-js/faker';
import assert from 'assert';
import {OutgoingHttpHeaders} from 'http';
import fetch, {HeadersInit} from 'node-fetch';
import {afterEach, describe, expect, test} from 'vitest';
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

describe('proxyErrorHandling', () => {
  test.each(
    mixAndMatchObject<TestReverseProxyParams>({
      proxyProtocol: () => ['https:', 'http:'],
    }),
  )('proxy %j returns 400 if there was a request error', async params => {
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

    const reqPath = '///'; // invalid url
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

    expect(response.status).toBe(400);
  });
});
