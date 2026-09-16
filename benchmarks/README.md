# fimiproxy benchmarks

In-process HTTP load harness using [autocannon](https://github.com/mcollina/autocannon).

```bash
npm run bench
npm run bench -- --duration 20 --connections 100
npm run bench -- --https
```

This harness always runs a **single-process** proxy (`workers: 1`) so it can start/stop cleanly inside one Node process.

To measure multi-worker scaling:

1. Start fimiproxy via CLI with `"workers": N` (and `"workers": 1` as baseline) in your config.
2. Point autocannon at the listening port with the correct `Host` header.
