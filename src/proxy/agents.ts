import {Agent as HttpAgent} from 'node:http';
import {Agent as HttpsAgent} from 'node:https';
import {ResolvedFimiproxyConfig} from './defaults.js';

export interface ProxyAgents {
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
  destroy(): void;
}

export function createProxyAgents(config: ResolvedFimiproxyConfig): ProxyAgents {
  const httpAgent = new HttpAgent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    maxFreeSockets: config.maxFreeSockets,
  });
  const httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    maxFreeSockets: config.maxFreeSockets,
  });

  return {
    httpAgent,
    httpsAgent,
    destroy() {
      httpAgent.destroy();
      httpsAgent.destroy();
    },
  };
}
