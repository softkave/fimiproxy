# fimiproxy

simple HTTP | HTTPS | WS | WSS reverse proxy in node.js. currently supports:

- reverse proxy using incoming request's `x-forwarded-host` or `host` header to pre-configured origin servers. see [Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host) and [X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host)
- proxy incoming `http:` or `https:` request to origin `http:` or `https:` servers
- proxy incoming `ws:` or `wss:` request to origin `ws:` or `wss:` servers
- supports graceful shutdowns
- supports round-robin origin server selection
- supports force upgrade `http:` to `https:` and `ws:` to `wss:`

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
      "usePermanentRedirect": false,
      "redirectHost": ""
    }
  ],
  "forceUpgradeHttpToHttps": false,
  "forceUpgradeWsToWss": false,
  "usePermanentRedirect": false,
  "redirectHost": ""
}
```

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
- `routes` — array of incoming host to origin protocol, host, and port
  - `origin` — array of origin server host, port, and protocol
    - `originHost` — origin host or IP
    - `originPort` — origin port
    - `originProtocol` — origin protocol. one of `http:` or `https:` or `ws:` or `wss:`. don't forget the `:` at the end
  - `incomingHostAndPort` — incoming `host:port` to proxy to origin server. picked from HTTP `host` header field
  - `forceUpgradeHttpToHttps` — set to `true` to force upgrade `http:` request to `https:` request
  - `forceUpgradeWsToWss` — set to `true` to force upgrade `ws:` request to `wss:` request
  - `usePermanentRedirect` — set to `true` to use permanent redirect. The proxy server will return a `308` redirect response to the client instead of the default `307` temporary redirect response.
  - `redirectHost` — host to redirect to. if not set, the proxy server will redirect to the incoming `x-forwarded-host` or `host` header field.
- `forceUpgradeHttpToHttps` — set to `true` to force upgrade `http:` request to `https:` request
- `forceUpgradeWsToWss` — set to `true` to force upgrade `ws:` request to `wss:` request
- `usePermanentRedirect` — set to `true` to use permanent redirect. The proxy server will return a `308` redirect response to the client instead of the default `307` temporary redirect response.
- `redirectHost` — host to redirect to. if not set, the proxy server will redirect to the incoming `x-forwarded-host` or `host` header field.

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
    exposeHttpProxy: false,
    exposeHttpsProxy: false,
    httpPort: "80",
    httpsPort: "443",
    routes: [{
      origin: [{
        originHost: "localhost",
        originPort: "0000",
        originProtocol: "https:",
      }],
      incomingHostAndPort: "www.fimidara.com:80",
    }],
    httpsPublicKey: "",
    httpsPrivateKey: "",
    httpsPublicKeyFilepath: "",
    httpsPrivateKeyFilepath: "",
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

### Limitations

- cannot sustain multiple start calls, because current state is managed using a module-global variable. we'll eventually transition to a class-based encapsulation system, so stick around (if you're versed in Typescript, you can contribute to this effort). multiple start calls will either lead to existing servers being garbage collected or memory leak, i haven't tested it. so call `endFimiproxy` before making another start call. start calls are calls to `startFimiproxyUsingConfig`, `startFimiproxyUsingConfigFile`, or `startFimiproxyUsingProcessArgs`
