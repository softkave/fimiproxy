import {faker} from '@faker-js/faker';
import express from 'express';
import forge from 'node-forge';
import assert from 'node:assert';
import console from 'node:console';
import {promises as fsPromises} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {Socket} from 'node:net';
import {FimiproxyRuntimeConfig} from '../types';

export type FimiporxyHttpProtocol = 'http:' | 'https:';

const kHttpPartSeparator = '\r\n';
const kHttpHeaderKeyValueSeparator = ':';

async function createHttpServer(port: string | number, app: express.Express) {
  const httpServer = http.createServer(app);
  return new Promise<{httpServer: http.Server}>(resolve => {
    httpServer.listen(port, () => {
      resolve({httpServer});
    });
  });
}

async function createHttpsServer(
  port: string | number,
  app: express.Express,
  credentials?: {key: string; cert: string}
) {
  if (!credentials) {
    const {publicKey, privateKey} = await generatePublicPrivateKeyPair();
    // const {privateKeyFilepath, publicKeyFilepath} =
    //   await generatePublicPrivateKeyPair();
    // const privateKeyFilepath = './certs/private-key.pem';
    // const publicKeyFilepath = './certs/public-key.pem';
    // const [publicKey, privateKey] = await Promise.all([
    //   fsPromises.readFile(publicKeyFilepath, 'utf-8'),
    //   fsPromises.readFile(privateKeyFilepath, 'utf-8'),
    // ]);
    credentials = {key: privateKey, cert: publicKey};
  }

  const httpsServer = https.createServer(credentials, app);
  return new Promise<{
    httpsServer: http.Server;
    credentials: {key: string; cert: string};
  }>(resolve => {
    httpsServer.listen(port, () => {
      assert(credentials);
      resolve({httpsServer, credentials});
    });
  });
}

export async function createExpressHttpServer(props: {
  protocol: FimiporxyHttpProtocol | FimiporxyHttpProtocol[];
  httpPort?: string | number;
  httpsPort?: string | number;
  credentials?: {key: string; cert: string};
}) {
  const {protocol, httpPort, httpsPort, credentials} = props;
  const app = express();
  const [httpServer, httpsServer] = await Promise.all([
    protocol === 'http:' && httpPort
      ? createHttpServer(httpPort, app)
      : undefined,
    protocol === 'https:' && httpsPort
      ? createHttpsServer(httpsPort, app, credentials)
      : undefined,
  ]);

  return {app, ...httpServer, ...httpsServer};
}

export async function startHttpConnectCall(
  connectOpts: Required<Pick<http.RequestOptions, 'port' | 'host'>>,
  originOpts: Required<Pick<http.RequestOptions, 'port' | 'host' | 'path'>>,
  protocol: FimiporxyHttpProtocol
) {
  const options: http.RequestOptions = {
    protocol,
    port: connectOpts.port,
    host: connectOpts.host,
    path: originOpts.path,
    method: 'CONNECT',
    setHost: false,
    headers: {
      host: originOpts.host + ':' + originOpts.port,
    },
  };
  const req =
    protocol === 'http:' ? http.request(options) : https.request(options);
  req.end();

  return new Promise<{res: http.IncomingMessage; socket: Socket; head: Buffer}>(
    (resolve, reject) => {
      req.on('connect', (res, socket, head) => {
        resolve({res, socket, head});
      });
      req.on('error', error => {
        console.error(error);
        reject(error);
      });
    }
  );
}

export async function writeHttpMessageToSocket(
  socket: Socket,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string
) {
  return new Promise<void>((resolve, reject) => {
    const message =
      `${method} ${path} HTTP/1.1` +
      kHttpPartSeparator +
      Object.entries(headers)
        .map(([key, value]) => key + kHttpHeaderKeyValueSeparator + value)
        .join(kHttpPartSeparator) +
      kHttpPartSeparator +
      kHttpPartSeparator +
      (body ? body + kHttpPartSeparator : '');

    socket.write(message, error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function isHttpRequest(signature: string) {
  // request signature looks like `GET /software/index.html HTTP/1.1`
  // return signature.endsWith('HTTP/1.1');
  return signature.match(/^.+ HTTP\/1.1$/);
}

function isHttpResponse(signature: string) {
  // response signature looks like `HTTP/1.1 200 OK`
  // return signature.startsWith('HTTP/1.1');
  return signature.match(/^HTTP\/1.1 .+$/);
}

function parseHttpRequestSignature(signature: string) {
  const [method, path, httpVersion] = signature.split(' ');
  return {method, path, httpVersion};
}

function parseHttpResponseSignature(signature: string) {
  const [httpVersion, statusCode, statusText] = signature.split(' ');
  return {httpVersion, statusCode, statusText};
}

function parseHttpSignature(signature: string) {
  if (isHttpRequest(signature)) {
    return {type: 'req', ...parseHttpRequestSignature(signature)} as const;
  } else if (isHttpResponse(signature)) {
    return {type: 'res', ...parseHttpResponseSignature(signature)} as const;
  }

  return undefined;
}

export function parseHttpMessage(message: string) {
  const parts = message.split(kHttpPartSeparator);

  const signaturePart = parts.shift() || '';
  const signature = parseHttpSignature(signaturePart);

  const headersEndIndex = Math.min(
    // there's a double '\r\n' separator between the last header, and http body,
    // which'll yield an  empty '' when split by '\r\n'
    parts.findIndex(part => part === ''),
    parts.length
  );
  const headerParts = parts.slice(0, headersEndIndex);
  const headers = headerParts.reduce(
    (acc, part) => {
      const [key, value] = part.split(kHttpHeaderKeyValueSeparator + ' ');
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>
  );

  const body = parts.slice(headersEndIndex + 1).join('');

  return {
    signature,
    headers,
    body,
  };
}

export async function parseHttpMessageFromSocket(socket: Socket) {
  const chunks: string[] = [];

  socket.on('data', chunk => {
    chunks.push(chunk.toString());
  });

  return new Promise<ReturnType<typeof parseHttpMessage>>((resolve, reject) => {
    socket.on('end', () => {
      resolve(parseHttpMessage(chunks.join()));
    });
    socket.on('error', error => {
      console.error(error);
      reject(error);
    });
  });
}

export async function closeHttpServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function generateTestFimiproxyConfig(
  seed: Partial<FimiproxyRuntimeConfig> = {}
): Promise<FimiproxyRuntimeConfig> {
  const credentials = seed?.exposeHttpsProxy
    ? await generatePublicPrivateKeyPair()
    : undefined;
  // const cert: {publicKey?: string; privateKey?: string} = {};

  // if (credentials) {
  //   const {privateKeyFilepath, publicKeyFilepath} = credentials;
  //   const [publicKey, privateKey] = await Promise.all([
  //     fsPromises.readFile(publicKeyFilepath, 'utf-8'),
  //     fsPromises.readFile(privateKeyFilepath, 'utf-8'),
  //   ]);
  //   cert.privateKey = privateKey;
  //   cert.publicKey = publicKey;
  // }

  return {
    exposeHttpProxy: false,
    exposeHttpsProxy: false,
    httpPort: faker.internet.port().toString(),
    httpsPort: faker.internet.port().toString(),
    routes: [],
    // httpsPublicKey: cert?.publicKey,
    // httpsPrivateKey: cert?.privateKey,
    httpsPublicKey: credentials?.publicKey,
    httpsPrivateKey: credentials?.privateKey,
    // httpsPrivateKeyFilepath: './certs/private-key.pem',
    // httpsPublicKeyFilepath: './certs/public-key.pem',
    ...seed,
  };
}

export async function generatePublicPrivateKeyPair() {
  // see https://github.com/digitalbazaar/forge?tab=readme-ov-file#x509
  const pki = forge.pki;
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    {name: 'commonName', value: 'fimidara.com'},
    {name: 'countryName', value: 'US'},
    {shortName: 'ST', value: 'Indiana'},
    {name: 'localityName', value: 'Carmel'},
    {name: 'organizationName', value: 'softkave'},
    {shortName: 'OU', value: 'fimidara'},
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {name: 'basicConstraints', cA: true},
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true,
    },
    // {
    //   name: 'subjectAltName',
    //   altNames: [
    //     {/** URI */ type: 6, value: 'http://example.org/webid#me'},
    //     {/** IP */ type: 7, ip: '127.0.0.1'},
    //   ],
    // },
    // {name: 'subjectKeyIdentifier'},
  ]);
  cert.sign(keys.privateKey);

  const pemPublicKey = pki.certificateToPem(cert);
  const pemPrivateKey = pki.privateKeyToPem(keys.privateKey);

  const publicKeyFilepath = './certs/test-public-key.pem';
  const privateKeyFilepath = './certs/test-private-key.pem';
  await Promise.all([
    fsPromises.writeFile(publicKeyFilepath, pemPublicKey, 'utf-8'),
    fsPromises.writeFile(privateKeyFilepath, pemPrivateKey, 'utf-8'),
  ]);

  return {
    publicKeyFilepath,
    privateKeyFilepath,
    privateKey: pemPrivateKey,
    publicKey: pemPublicKey,
  };
}

type MixAndMatchObjectUsing<T extends object> = {
  [K in keyof T]: () => Array<T[K]>;
};

/**
 * `incrementMixAndMatchIterator([1,1,1], [2,2,2])` should produce
 * - `iterator === [1,1,2]`
 *
 * `incrementMixAndMatchIterator([1,1,2], [2,2,2])` should produce
 * - `iterator === [1,2,0]`
 *
 * `incrementMixAndMatchIterator([1,2,2], [2,2,2])` should produce
 * - `iterator === [2,0,0]`
 *
 * `incrementMixAndMatchIterator([2,2,2], [2,2,2])` should produce
 * - `iterator === [2,2,2]`
 */
export function incrementMixAndMatchIterator(
  iterator: number[],
  max: number[]
) {
  for (let i = iterator.length - 1; i >= 0; i--) {
    const v = iterator[i] + 1;
    const m = max[i];

    if (v < m) {
      iterator[i] = v;
      iterator.fill(0, i + 1);
      return true;
    } else {
      continue;
    }
  }

  return false;
}

export function mixAndMatchObject<T extends Record<string, unknown>>(
  seed: MixAndMatchObjectUsing<T>
) {
  const fields = Object.keys(seed);
  const seedFields = fields.map(field => seed[field as keyof T]());
  const max = seedFields.map(seedField => seedField.length);
  const iterator: number[] = Array(fields.length).fill(0);
  const result: T[] = [];

  for (
    let continueIteration = true;
    continueIteration;
    continueIteration = incrementMixAndMatchIterator(iterator, max)
  ) {
    const value = iterator.reduce(
      (acc, v, i) => {
        const k = fields[i];
        acc[k] = seedFields[i][v];
        return acc;
      },
      {} as Record<string, unknown>
    );
    result.push(value as T);
  }

  return result;
}
