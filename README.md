# fimiproxy

simple HTTP | HTTPS | WS | WSS reverse proxy in node.js. currently supports:

- reverse proxy using incoming request's `x-forwarded-host` or `host` header to pre-configured origin servers. see [Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host) and [X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host)
- proxy incoming `http:` or `https:` request to origin `http:` or `https:` servers
- proxy incoming `ws:` or `wss:` request to origin `ws:` or `wss:` servers
- supports graceful shutdowns
- supports round-robin origin server selection (optional TCP health checks)
- supports force upgrade `http:` to `https:` and `ws:` to `wss:`
- supports forced redirects for host migration
- supports URL parts preservation during redirects
- multi-core via `node:cluster` (`workers` config; default = CPU count)
- keep-alive outbound agents, stream backpressure, and configurable timeouts
- async structured JSON logging (`logLevel`, optional `accessLog`)
- optional metrics (`metricsEnabled` / localhost `adminPort` → `GET /metrics`)

Requires **Node.js >= 20**.

## installation

- for global installation `npm i fimiproxy -g`
- for local installation `npm i fimiproxy`
- for local dev-dependency installation `npm i fimiproxy -D`

replace `npm` with `yarn` or any other package manager of choice.

## configuration

```json
{
  "exposeHttpProxy": false,
  "httpPort": "",
  "exposeHttpsProxy": false,
  "httpsPort": "",
  "exposeWsProxyForHttp": false,
  "exposeWsProxyForHttps": false,
  "httpsPublicKeyFilepath": "",
  "httpsPrivateKeyFilepath": "",
  "httpsPublicKey": "",
  "httpsPrivateKey": "",
  "debug": false,
  "workers": 1,
  "originTimeoutMs": 30000,
  "headersTimeoutMs": 60000,
  "requestTimeoutMs": 0,
  "keepAliveTimeoutMs": 5000,
  "maxSockets": 256,
  "maxFreeSockets": 256,
  "maxConnections": 0,
  "accessLog": false,
  "logLevel": "info",
  "originHealthEnabled": false,
  "originHealthIntervalMs": 10000,
  "metricsEnabled": false,
  "metricsLogIntervalMs": 60000,
  "adminPort": "",
  "routes": [
    {
      "origin": [
        {
          "originHost": "",
          "originPort": "",
          "originProtocol": "http:"
        },
        {
          "originHost": "",
          "originPort": "",
          "originProtocol": "ws:"
        }
      ],
      "incomingHostAndPort": "",
      "forceUpgradeHttpToHttps": false,
      "forceUpgradeWsToWss": false,
      "forceRedirect": false,
      "usePermanentRedirect": false,
      "redirectHost": "",
      "redirectURLParts": false,
      "overrideHost": ""
    }
  ],
  "forceUpgradeHttpToHttps": false,
  "forceUpgradeWsToWss": false,
  "usePermanentRedirect": false,
  "redirectHost": "",
  "redirectURLParts": false
}
```

### Global Configuration Options

- `exposeHttpProxy` — set to `true` to expose an HTTP server, requires `httpPort` to be set if `true`
- `exposeHttpsProxy` — set to `true` to expose an HTTPS server, requires `httpsPort`, `httpsPublicKey` OR `httpsPublicKeyFilepath`, `httpsPrivateKey` OR `httpsPrivateKeyFilepath` to be set if `true`
- `exposeWsProxyForHttp` — set to `true` to expose a WebSocket server for HTTP requests, requires `httpPort` and `exposeHttpProxy` to be set if `true`
- `exposeWsProxyForHttps` — set to `true` to expose a WebSocket server for HTTPS requests, requires `httpsPort` and `exposeHttpsProxy` to be set if `true`
- `httpPort` — port HTTP server should listen on, when `exposeHttpProxy` is `true`
- `httpsPort` — port HTTPS server should listen on, when `exposeHttpsProxy` is `true`
- `httpsPublicKeyFilepath` — filepath to TLS certificate (public key) used with HTTPS server
- `httpsPrivateKeyFilepath` — filepath to TLS private key used with HTTPS server
- `httpsPublicKey` — TLS certificate (public key) string used with HTTPS server. takes precedence over `httpsPublicKeyFilepath`
- `httpsPrivateKey` — TLS private key string used with HTTPS server. takes precedence over `httpsPrivateKeyFilepath`
- `debug` — set to `true` to enable debug logging for troubleshooting (also forces `logLevel` to `debug`)
- `workers` — number of cluster worker processes. Default: `os.availableParallelism()`. Set to `1` for a single process (recommended for tests and simple local use). When `workers > 1`, a primary process forks workers that share the listen ports; keep your process manager / deploy `count` at **1** (do not run multiple independent masters on :80/:443)
- `originTimeoutMs` — timeout for origin HTTP requests and WebSocket opens (default `30000`)
- `headersTimeoutMs` — inbound headers timeout (default `60000`)
- `requestTimeoutMs` — inbound request timeout; `0` disables (default `0`)
- `keepAliveTimeoutMs` — inbound keep-alive timeout (default `5000`)
- `maxSockets` / `maxFreeSockets` — outbound keep-alive `http`/`https` agent pool sizes (default `256`)
- `maxConnections` — max concurrent inbound connections; `0` = unlimited (default `0`). Excess connections are dropped by Node
- `accessLog` — when `true`, emit structured per-request access lines (default `false`)
- `logLevel` — `error` | `warn` | `info` | `debug` (default `info`)
- `originHealthEnabled` — when `true`, periodically TCP-check origins and skip unhealthy ones in round-robin (default `false`)
- `originHealthIntervalMs` — health check interval (default `10000`)
- `metricsEnabled` — when `true`, periodically log a metrics snapshot (default `false`)
- `metricsLogIntervalMs` — metrics log interval (default `60000`)
- `adminPort` — if set, listen on `127.0.0.1:adminPort` and serve `GET /metrics` as JSON
- `forceUpgradeHttpToHttps` — set to `true` to force upgrade all `http:` requests to `https:` requests globally
- `forceUpgradeWsToWss` — set to `true` to force upgrade all `ws:` requests to `wss:` requests globally
- `usePermanentRedirect` — set to `true` to use permanent redirect globally. The proxy server will return a `308` redirect response to the client instead of the default `307` temporary redirect response
- `redirectHost` — default host to redirect to globally, e.g. when upgrading to HTTPS or WSS, or if the incoming host is no longer supported and all requests to it should be redirected somewhere else. if not set, the proxy server will redirect to the incoming `x-forwarded-host` or `host` header field
- `redirectURLParts` — controls which URL parts are preserved during redirects. Can be `true` (preserve all parts), `false` (preserve only host), or an object specifying which parts to preserve (see Route-level Configuration below)

### Logging

Logs are **structured JSON lines** written asynchronously to stdout/stderr. Typical fields: `level`, `msg`, `time`, `pid`, optional `workerId`, plus event-specific fields (`host`, `origin`, `status`, `durationMs`, errors).

- Default: startup/route configuration + errors
- `accessLog: true`: one access line per completed HTTP/WS request
- `debug: true` / `logLevel: "debug"`: routing and origin option details

### Route-level Configuration

- `routes` — array of incoming host to origin protocol, host, and port mappings
  - `origin` — array of origin server host, port, and protocol (supports round-robin load balancing)
    - `originHost` — origin host or IP address
    - `originPort` — origin port number
    - `originProtocol` — origin protocol. one of `http:`, `https:`, `ws:`, or `wss:`. don't forget the `:` at the end
  - `incomingHostAndPort` — incoming `host:port` pattern to match for proxying to origin server. picked from HTTP `host` header field. Examples: `example.com:80`, `api.example.com`, `*.example.com` (wildcards supported)
  - `forceUpgradeHttpToHttps` — set to `true` to force upgrade `http:` requests to `https:` requests for this route
  - `forceUpgradeWsToWss` — set to `true` to force upgrade `ws:` requests to `wss:` requests for this route
  - `forceRedirect` — set to `true` to force redirect all requests to this route to the `redirectHost`. useful for permanent host migrations
  - `usePermanentRedirect` — set to `true` to use permanent redirect for this route. The proxy server will return a `308` redirect response to the client instead of the default `307` temporary redirect response
  - `redirectHost` — host to redirect to for this route, e.g. when upgrading to HTTPS or WSS, or when `forceRedirect` is enabled. if not set, the proxy server will redirect to the incoming `x-forwarded-host` or `host` header field
  - `redirectURLParts` — controls which URL parts are preserved during redirects for this route. Can be:
    - `true` — preserve all URL parts (protocol, pathname, search, username, password)
    - `false` — preserve only the host
    - An object with specific parts: `{ "protocol": true, "pathname": true, "search": false, "username": false, "password": false }`
  - `overrideHost` — if set, the proxy will override the `host` and `x-forwarded-host` header fields in requests sent to the origin server. useful for testing or when a specific host is required (e.g., for OAuth callbacks)

## Configuration Examples

### Basic HTTP to HTTPS Proxy

```json
{
  "exposeHttpProxy": true,
  "httpPort": "80",
  "exposeHttpsProxy": true,
  "httpsPort": "443",
  "httpsPublicKeyFilepath": "/path/to/cert.pem",
  "httpsPrivateKeyFilepath": "/path/to/key.pem",
  "routes": [
    {
      "origin": [
        {
          "originHost": "localhost",
          "originPort": 3000,
          "originProtocol": "http:"
        }
      ],
      "incomingHostAndPort": "example.com",
      "forceUpgradeHttpToHttps": true
    }
  ]
}
```

### Load Balancing with Multiple Origins

```json
{
  "exposeHttpsProxy": true,
  "httpsPort": "443",
  "httpsPublicKey": "-----BEGIN CERTIFICATE-----\n...",
  "httpsPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "routes": [
    {
      "origin": [
        {
          "originHost": "backend1.internal",
          "originPort": 8080,
          "originProtocol": "http:"
        },
        {
          "originHost": "backend2.internal",
          "originPort": 8080,
          "originProtocol": "http:"
        }
      ],
      "incomingHostAndPort": "api.example.com"
    }
  ]
}
```

### Host Migration with Force Redirect

```json
{
  "exposeHttpProxy": true,
  "httpPort": "80",
  "routes": [
    {
      "origin": [],
      "incomingHostAndPort": "old-domain.com",
      "forceRedirect": true,
      "redirectHost": "new-domain.com",
      "usePermanentRedirect": true,
      "redirectURLParts": {
        "pathname": true,
        "search": true
      }
    }
  ]
}
```

### WebSocket Proxy

```json
{
  "exposeHttpsProxy": true,
  "httpsPort": "443",
  "exposeWsProxyForHttps": true,
  "httpsPublicKeyFilepath": "/path/to/cert.pem",
  "httpsPrivateKeyFilepath": "/path/to/key.pem",
  "routes": [
    {
      "origin": [
        {
          "originHost": "websocket-server.internal",
          "originPort": 8080,
          "originProtocol": "ws:"
        }
      ],
      "incomingHostAndPort": "ws.example.com",
      "forceUpgradeWsToWss": true
    }
  ]
}
```

## How to run

### Using Command Line Arguments

- if installed globally, run `fimiproxy ./path/to/config.json`
- if installed locally, run `npm exec fimiproxy ./path/to/config.json`
- for one-time run, run `npx -y fimiproxy ./path/to/config.json`

### Using Environment Variable

Alternatively, you can start fimiproxy without passing a config filepath argument by setting the `FIMIPROXY_CONFIG_FILEPATH` environment variable:

```bash
# Set the environment variable
export FIMIPROXY_CONFIG_FILEPATH=./path/to/config.json

# Then run fimiproxy without arguments
fimiproxy
```

Or in a single command:

```bash
FIMIPROXY_CONFIG_FILEPATH=./path/to/config.json fimiproxy
```

**Note**: The command line argument takes precedence over the environment variable. If both are provided, the command line argument will be used.

## How to use as lib

```typescript
import fimiproxy from "fimiproxy"

// start fimiproxy
await fimiproxy.startFimiproxyUsingConfig({
  /** config */ {
    exposeHttpProxy: true,
    exposeHttpsProxy: true,
    httpPort: "80",
    httpsPort: "443",
    workers: 1,
    debug: false,
    routes: [{
      origin: [{
        originHost: "localhost",
        originPort: 3000,
        originProtocol: "https:",
      }],
      incomingHostAndPort: "www.example.com",
      forceUpgradeHttpToHttps: true,
      overrideHost: "localhost:3000"
    }],
    httpsPublicKey: "-----BEGIN CERTIFICATE-----\n...",
    httpsPrivateKey: "-----BEGIN PRIVATE KEY-----\n...",
  },
  /** shouldHandleGracefulShutdown */ true,
  /** exitProcessOnShutdown */ true,
});

// end fimiproxy
await fimiproxy.endFimiproxy(/** exitProcessOnShutdown */ true);
```

### API

- `startFimiproxyUsingConfig` — start fimiproxy using config
  - `config: FimiproxyRuntimeConfig` — see configuration above
  - `shouldHandleGracefulShutdown` — defaults to `true`. if `true`, will listen for `SIGINT` and `SIGTERM`, and attempt to gracefully shut down the proxy server. When `false`, forces single-process mode (useful for tests)
  - `exitProcessOnShutdown` — defaults to `true`. if `shouldHandleGracefulShutdown` is `true`, will call `process.exit()` after graceful shutdown. your process may not shut down after `SIGINT` and `SIGTERM` if not `true`. currently untested behaviour (if process will shutdown or not) when set to `false` and `shouldHandleGracefulShutdown` is `true`
- `startFimiproxyUsingConfigFile` — start fimiproxy using config read from filepath
  - `filepath: string` — file at filepath should be a json file, see configuration section above
- `startFimiproxyUsingProcessArgs` — start fimiproxy using filepath picked from `process.argv[2]` see [https://nodejs.org/docs/latest/api/process.html#processargv](https://nodejs.org/docs/latest/api/process.html#processargv). example, `node your-script.js ./path/to/config.json`
- `startFimiproxyUsingEnvVar` — start fimiproxy using filepath from environment variable (defaults to `FIMIPROXY_CONFIG_FILEPATH`)
- `endFimiproxy` — gracefully end fimiproxy (returns a Promise)
  - `exitProcess` — defaults to `true`. calls `process.exit()` if `true`
- `setupGracefulShutdown` — register SIGINT/SIGTERM handlers without shutting down immediately (used internally when `shouldHandleGracefulShutdown` is true)

## Common Use Cases

### 1. Development Environment

Use fimiproxy to proxy local development servers with SSL termination:

```bash
fimiproxy dev-config.json
```

### 2. Microservices Gateway

Route different subdomains to different microservices:

- `api.example.com` → backend API service
- `ws.example.com` → WebSocket service
- `cdn.example.com` → static file server

### 3. Host Migration

Gradually migrate from old domain to new domain while preserving SEO:

- Use `forceRedirect` with `usePermanentRedirect: true`
- Preserve URL paths and query parameters with `redirectURLParts`

### 4. Load Balancing

Distribute traffic across multiple backend servers using round-robin selection. Enable `originHealthEnabled` to skip origins that fail periodic TCP checks (if all are unhealthy, fimiproxy falls back to the full origin list so traffic is not hard-stopped).

## Production performance notes

- Prefer `workers` equal to CPU count on production hosts that terminate TLS (HTTPS benefits most from multi-core).
- Keep deploy/process-manager instance count at **1**; multi-core is internal cluster, not multiple masters binding the same privileged ports.
- Leave `accessLog` off unless you need it; errors still log at `error` level.
- Tune `maxSockets` for busy localhost fan-out; set `maxConnections` if you need overload protection.
- Run a quick load check with `npm run bench` (see [benchmarks](./benchmarks)).

## Benchmarks

```bash
npm run bench
npm run bench -- --duration 20 --connections 100
```

The in-process harness uses `workers: 1`. To compare multi-worker RPS, start fimiproxy via the CLI with `"workers": N` in config and point `autocannon` (or similar) at that process.

## Troubleshooting

### Enable Debug Mode

Set `debug: true` in your configuration or use the `FIMIPROXY_DEBUG=true` environment variable to see detailed logs. Alternatively set `"logLevel": "debug"`.

### Common Issues

1. **EADDRINUSE Error**: Port already in use

   - Check if another process is using the port: `lsof -i :PORT`
   - Use different ports in your configuration
   - Do not raise external process `count` above 1 for the same :80/:443 — use `workers` instead

2. **SSL Certificate Issues**:

   - Ensure certificate files exist and are readable
   - Verify certificate format (PEM)
   - Check certificate expiration

3. **WebSocket Connection Issues**:

   - Ensure `exposeWsProxyForHttp` or `exposeWsProxyForHttps` is enabled
   - Verify origin server supports WebSocket protocol
   - Check for protocol mismatch (ws vs wss)
   - Origin open failures time out after `originTimeoutMs`

4. **Host Header Issues**:
   - Use `overrideHost` if the origin server expects specific host headers
   - Check that `incomingHostAndPort` matches the actual request host

### Limitations

- Call `endFimiproxy()` before another `startFimiproxy*` in the same process. State is held on a per-process `FimiproxyInstance`; overlapping starts without teardown are unsupported.
- Round-robin is simple rotation (not weighted or sticky). Optional TCP health checks can skip unhealthy origins when `originHealthEnabled` is true.
- Wildcard hosts (`*.example.com`) are documented historically; matching is exact `incomingHostAndPort` lookup today.
