#!/usr/bin/env node

import {
  kFimiproxyConfigFilepathEnvVar,
  startFimiproxyUsingEnvVar,
  startFimiproxyUsingProcessArgs,
} from './proxy/startFimiproxy.js';

async function main() {
  const attempt1 = await startFimiproxyUsingProcessArgs({dontThrow: true});
  if (!attempt1) {
    const attempt2 = await startFimiproxyUsingEnvVar({dontThrow: true});
    if (!attempt2) {
      console.error(
        'Failed to start fimiproxy. ' +
          'Please provide a config file path as an argument or set the ' +
          kFimiproxyConfigFilepathEnvVar +
          ' environment variable.',
      );
      process.exit(1);
    }
  }
}

main().catch(console.error.bind(console));
