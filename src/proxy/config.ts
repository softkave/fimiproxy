import {promises as fsPromises} from 'node:fs';
import {FimiproxyRuntimeConfig} from '../types.js';

async function tryReadFile(filepath?: string) {
  return filepath ? fsPromises.readFile(filepath, 'utf8') : undefined;
}

export async function prepareHttpsCredentials(config: FimiproxyRuntimeConfig) {
  const [privateKey, certificate] = await Promise.all([
    config.httpsPrivateKey || tryReadFile(config.httpsPrivateKeyFilepath),
    config.httpsPublicKey || tryReadFile(config.httpsPublicKeyFilepath),
  ]);

  return {key: privateKey, cert: certificate};
}
