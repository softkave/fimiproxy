import {availableParallelism} from 'node:os';
import {FimiproxyLogLevel, FimiproxyRuntimeConfig} from '../types.js';

export const kFimiproxyDefaults = {
  originTimeoutMs: 30_000,
  headersTimeoutMs: 60_000,
  requestTimeoutMs: 0, // 0 = Node default (no request timeout)
  keepAliveTimeoutMs: 5_000,
  maxSockets: 256,
  maxFreeSockets: 256,
  maxConnections: 0, // 0 = unlimited
  accessLog: false,
  logLevel: 'info' as FimiproxyLogLevel,
  originHealthIntervalMs: 10_000,
  originHealthEnabled: false,
  metricsLogIntervalMs: 60_000,
  metricsEnabled: false,
  adminPort: undefined as string | undefined,
  workers: undefined as number | undefined,
};

export type ResolvedFimiproxyConfig = FimiproxyRuntimeConfig & {
  originTimeoutMs: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxSockets: number;
  maxFreeSockets: number;
  maxConnections: number;
  accessLog: boolean;
  logLevel: FimiproxyLogLevel;
  originHealthIntervalMs: number;
  originHealthEnabled: boolean;
  metricsLogIntervalMs: number;
  metricsEnabled: boolean;
  adminPort?: string;
  workers: number;
  debug: boolean;
};

export function resolveWorkerCount(
  config: FimiproxyRuntimeConfig,
  options: {forceSingleProcess?: boolean} = {},
): number {
  if (options.forceSingleProcess) {
    return 1;
  }
  if (process.env.FIMIPROXY_IS_WORKER === '1') {
    return 1;
  }
  if (typeof config.workers === 'number' && config.workers >= 1) {
    return Math.floor(config.workers);
  }
  try {
    return availableParallelism();
  } catch {
    return 1;
  }
}

export function resolveConfig(
  config: FimiproxyRuntimeConfig,
  options: {forceSingleProcess?: boolean} = {},
): ResolvedFimiproxyConfig {
  const debug = Boolean(config.debug || process.env.FIMIPROXY_DEBUG === 'true');
  let logLevel: FimiproxyLogLevel =
    config.logLevel ?? (debug ? 'debug' : kFimiproxyDefaults.logLevel);
  if (debug && logLevel !== 'debug') {
    logLevel = 'debug';
  }

  return {
    ...config,
    debug,
    originTimeoutMs:
      config.originTimeoutMs ?? kFimiproxyDefaults.originTimeoutMs,
    headersTimeoutMs:
      config.headersTimeoutMs ?? kFimiproxyDefaults.headersTimeoutMs,
    requestTimeoutMs:
      config.requestTimeoutMs ?? kFimiproxyDefaults.requestTimeoutMs,
    keepAliveTimeoutMs:
      config.keepAliveTimeoutMs ?? kFimiproxyDefaults.keepAliveTimeoutMs,
    maxSockets: config.maxSockets ?? kFimiproxyDefaults.maxSockets,
    maxFreeSockets: config.maxFreeSockets ?? kFimiproxyDefaults.maxFreeSockets,
    maxConnections:
      config.maxConnections ?? kFimiproxyDefaults.maxConnections,
    accessLog: config.accessLog ?? kFimiproxyDefaults.accessLog,
    logLevel,
    originHealthIntervalMs:
      config.originHealthIntervalMs ??
      kFimiproxyDefaults.originHealthIntervalMs,
    originHealthEnabled:
      config.originHealthEnabled ?? kFimiproxyDefaults.originHealthEnabled,
    metricsLogIntervalMs:
      config.metricsLogIntervalMs ?? kFimiproxyDefaults.metricsLogIntervalMs,
    metricsEnabled:
      config.metricsEnabled ?? kFimiproxyDefaults.metricsEnabled,
    adminPort: config.adminPort ?? kFimiproxyDefaults.adminPort,
    workers: resolveWorkerCount(config, options),
  };
}
