/**
 * Simple load harness for fimiproxy.
 *
 * Usage (from repo root after compile):
 *   npm run bench
 *   node build/benchmarks/run.js --duration 20 --connections 100
 *
 * For multi-worker comparison, run the fimiproxy CLI with `"workers": N` in
 * config and point autocannon at that process separately (cluster cannot be
 * driven in-process from this harness).
 */
import autocannon from 'autocannon';
import {createServer} from 'node:http';
import forge from 'node-forge';
import {endFimiproxy} from '../src/proxy/endFimiproxy.js';
import {startFimiproxyUsingConfig} from '../src/proxy/startFimiproxy.js';
import {FimiproxyRuntimeConfig} from '../src/types.js';

function parseArgs(argv: string[]) {
  const out = {duration: 10, connections: 100, https: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--duration') out.duration = Number(argv[++i]);
    else if (a === '--connections') out.connections = Number(argv[++i]);
    else if (a === '--https') out.https = true;
  }
  return out;
}

function selfSignedCert() {
  const pki = forge.pki;
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{name: 'commonName', value: 'localhost'}];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert),
  };
}

async function listenOrigin() {
  const server = createServer((_req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('ok');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('failed to bind origin');
  }
  return {server, port: addr.port};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const origin = await listenOrigin();
  const credentials = selfSignedCert();

  const proxyPort = 18080 + Math.floor(Math.random() * 1000);
  const host = `bench.local:${proxyPort}`;

  const config: FimiproxyRuntimeConfig = {
    workers: 1,
    exposeHttpProxy: !args.https,
    exposeHttpsProxy: args.https,
    httpPort: String(proxyPort),
    httpsPort: String(proxyPort),
    httpsPrivateKey: credentials.key,
    httpsPublicKey: credentials.cert,
    accessLog: false,
    logLevel: 'error',
    routes: [
      {
        incomingHostAndPort: host,
        origin: [
          {
            originHost: '127.0.0.1',
            originPort: origin.port,
            originProtocol: 'http:',
          },
        ],
      },
    ],
  };

  await startFimiproxyUsingConfig(config, false, false);

  const protocol = args.https ? 'https' : 'http';
  const url = `${protocol}://127.0.0.1:${proxyPort}/`;

  console.log(
    JSON.stringify({
      msg: 'bench starting',
      url,
      host,
      duration: args.duration,
      connections: args.connections,
    }),
  );

  const result = await autocannon({
    url,
    connections: args.connections,
    duration: args.duration,
    headers: {host},
  });

  console.log(
    JSON.stringify({
      msg: 'bench complete',
      requestsPerSec: result.requests.average,
      latencyAvgMs: result.latency.average,
      errors: result.errors,
      timeouts: result.timeouts,
      throughputBytesAvg: result.throughput.average,
    }),
  );

  await endFimiproxy(false);
  await new Promise<void>((resolve, reject) =>
    origin.server.close(err => (err ? reject(err) : resolve())),
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
