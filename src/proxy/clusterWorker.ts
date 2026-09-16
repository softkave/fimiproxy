#!/usr/bin/env node
/**
 * Cluster worker entry. Started by the primary via cluster.setupPrimary({exec}).
 * Reads config from FIMIPROXY_CONFIG_FILEPATH and runs a single-process proxy.
 */
import {startFimiproxyUsingConfigFile} from './startFimiproxy.js';
import {errorToLogFields, logger} from './logger.js';

const configPath = process.env.FIMIPROXY_CONFIG_FILEPATH;
if (!configPath) {
  logger.error('cluster worker missing FIMIPROXY_CONFIG_FILEPATH');
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}

const exitOnShutdown = process.env.FIMIPROXY_EXIT_ON_SHUTDOWN !== '0';

startFimiproxyUsingConfigFile(configPath)
  .then(async () => {
    // startFimiproxyUsingConfigFile always enables graceful shutdown with exit.
    // Override by patching: re-read and start with explicit flags if needed.
    if (!exitOnShutdown) {
      // Config-file start always exits on shutdown; workers should exit when
      // primary sends SIGTERM — default behavior is fine.
    }
  })
  .catch(error => {
    logger.error('cluster worker failed to start', errorToLogFields(error));
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
