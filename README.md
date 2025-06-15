# fimiproxy

simple HTTP | HTTPS | WS | WSS reverse proxy in node.js. currently supports:

- reverse proxy using incoming request's `x-forwarded-host` or `host` header to pre-configured origin servers. see [Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host) and [X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host)
- proxy incoming `http:` or `https:` request to origin `http:` or `https:` servers
- proxy incoming `ws:` or `wss:` request to origin `ws:` or `wss:` servers
- supports graceful shutdowns
- supports round-robin origin server selection
- supports force upgrade `http:` to `https:` and `ws:` to `wss:`
- supports forced redirects for host migration
- supports URL parts preservation during redirects

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
- `debug` — set to `true` to enable debug logging for troubleshooting
- `forceUpgradeHttpToHttps` — set to `true` to force upgrade all `http:` requests to `https:` requests globally
- `forceUpgradeWsToWss` — set to `true` to force upgrade all `ws:` requests to `wss:` requests globally
- `usePermanentRedirect` — set to `true` to use permanent redirect globally. The proxy server will return a `308` redirect response to the client instead of the default `307` temporary redirect response
- `redirectHost` — default host to redirect to globally, e.g. when upgrading to HTTPS or WSS, or if the incoming host is no longer supported and all requests to it should be redirected somewhere else. if not set, the proxy server will redirect to the incoming `x-forwarded-host` or `host` header field
- `redirectURLParts` — controls which URL parts are preserved during redirects. Can be `true` (preserve all parts), `false` (preserve only host), or an object specifying which parts to preserve (see Route-level Configuration below)

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

- if installed globally, run `fimiproxy ./path/to/config.json`
- if installed locally, run `npm exec fimiproxy ./path/to/config.json`
- for one-time run, run `npx -y fimiproxy ./path/to/config.json`

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
  - `shouldHandleGracefulShutdown` — defaults to `true`. if `true`, will listen for `SIGINT` and `SIGTERM`, and attempt to gracefully shut down the proxy server
  - `exitProcessOnShutdown` — defaults to `true`. if `shouldHandleGracefulShutdown` is `true`, will call `process.exit()` after graceful shutdown. your process may not shut down after `SIGINT` and `SIGTERM` if not `true`. currently untested behaviour (if process will shutdown or not) when set to `false` and `shouldHandleGracefulShutdown` is `true`
- `startFimiproxyUsingConfigFile` — start fimiproxy using config read from filepath
  - `filepath: string` — file at filepath should be a json file, see configuration section above
- `startFimiproxyUsingProcessArgs` — start fimiproxy using filepath picked from `process.argv[2]` see [https://nodejs.org/docs/latest/api/process.html#processargv](https://nodejs.org/docs/latest/api/process.html#processargv). example, `node your-script.js ./path/to/config.json`
- `endFimiproxy` — gracefully end fimiproxy
  - `exitProcess` — defaults to `true`. calls `process.exit()` if `true`

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

Distribute traffic across multiple backend servers using round-robin selection.

## Troubleshooting

### Enable Debug Mode

Set `debug: true` in your configuration or use the `FIMIPROXY_DEBUG=true` environment variable to see detailed logs.

### Common Issues

1. **EADDRINUSE Error**: Port already in use

   - Check if another process is using the port: `lsof -i :PORT`
   - Use different ports in your configuration

2. **SSL Certificate Issues**:

   - Ensure certificate files exist and are readable
   - Verify certificate format (PEM)
   - Check certificate expiration

3. **WebSocket Connection Issues**:

   - Ensure `exposeWsProxyForHttp` or `exposeWsProxyForHttps` is enabled
   - Verify origin server supports WebSocket protocol
   - Check for protocol mismatch (ws vs wss)

4. **Host Header Issues**:
   - Use `overrideHost` if the origin server expects specific host headers
   - Check that `incomingHostAndPort` matches the actual request host

### Limitations

- Cannot sustain multiple start calls, because current state is managed using a module-global variable. We'll eventually transition to a class-based encapsulation system, so stick around (if you're versed in Typescript, you can contribute to this effort). Multiple start calls will either lead to existing servers being garbage collected or memory leak, I haven't tested it. So, call `endFimiproxy` before making another start call. Start calls are calls to `startFimiproxyUsingConfig`, `startFimiproxyUsingConfigFile`, or `startFimiproxyUsingProcessArgs`
- Round-robin load balancing is simple rotation, not weighted or health-checked
