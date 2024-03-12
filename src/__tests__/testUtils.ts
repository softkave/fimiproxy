import {faker} from '@faker-js/faker';
import express from 'express';
import {generateKeyPair} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {Socket} from 'node:net';
import {promisify} from 'node:util';
import {FimiproxyRuntimeConfig} from '../types';

const kHttpPartSeparator = '\r\n';
const kHttpHeaderKeyValueSeparator = ':';

export async function createExpressHttpServer(port: string | number) {
  const app = express();
  const httpServer = http.createServer(app);

  return new Promise<{app: express.Express; httpServer: http.Server}>(
    resolve => {
      httpServer.listen(port, () => {
        resolve({app, httpServer});
      });
    }
  );
}

export async function createExpressHttpsServer(
  port: string,
  httpsPublicKeyFilepath: string,
  httpsPrivateKeyFilepath: string
) {
  const app = express();
  const [certificate, privateKey] = await Promise.all([
    fs.promises.readFile(httpsPublicKeyFilepath, 'utf8'),
    fs.promises.readFile(httpsPrivateKeyFilepath, 'utf8'),
  ]);
  const credentials = {key: privateKey, cert: certificate};
  const httpsServer = https.createServer(credentials, app);

  return new Promise<{app: express.Express; httpsServer: http.Server}>(
    resolve => {
      httpsServer.listen(port, () => {
        resolve({app, httpsServer});
      });
    }
  );
}

export async function startHttpConnectCall(
  connectOpts: Required<Pick<http.RequestOptions, 'port' | 'host'>>,
  originOpts: Required<Pick<http.RequestOptions, 'port' | 'host' | 'path'>>
) {
  const options: http.RequestOptions = {
    port: connectOpts.port,
    host: connectOpts.host,
    path: originOpts.path,
    method: 'CONNECT',
    setHost: false,
    headers: {
      host: originOpts.host + ':' + originOpts.port,
    },
  };
  const req = http.request(options);
  req.end();

  return new Promise<{res: http.IncomingMessage; socket: Socket; head: Buffer}>(
    resolve => {
      req.on('connect', (res, socket, head) => {
        resolve({res, socket, head});
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
    socket.write(
      `${method} ${path} HTTP/1.1` +
        kHttpPartSeparator +
        Object.entries(headers)
          .map(([key, value]) => key + kHttpHeaderKeyValueSeparator + value)
          .join(kHttpPartSeparator) +
        kHttpPartSeparator +
        kHttpPartSeparator +
        (body ? body + kHttpPartSeparator : ''),
      error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
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
      const [key, value] = part.split(kHttpHeaderKeyValueSeparator);
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>
  );

  const body = parts.slice(headersEndIndex + 1);

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

  return new Promise<ReturnType<typeof parseHttpMessage>>(resolve => {
    socket.on('end', () => {
      resolve(parseHttpMessage(chunks.join()));
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

export function generateTestFimiproxyConfig(
  seed: Partial<FimiproxyRuntimeConfig> = {}
): FimiproxyRuntimeConfig {
  return {
    exposeHttpProxy: true,
    exposeHttpsProxy: false,
    httpPort: faker.internet.port().toString(),
    httpsPort: faker.internet.port().toString(),
    routes: [],
    ...seed,
  };
}

const promisifiedGenerateKeyPair = promisify(generateKeyPair);

export async function generatePublicPrivateKeyPair() {
  return await promisifiedGenerateKeyPair('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: {type: 'spki', format: 'pem'},
    privateKeyEncoding: {type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc'},
  });
}
