import gracefulShutdown from 'http-graceful-shutdown';
import console from 'node:console';
import {
  getConjoinedPromise,
  kConjoinedPromiseSettlementType,
} from 'softkave-js-utils';
import {clearArtifacts, getArtifacts} from './artifacts.js';
import {clearRoutes} from './routes.js';

export function endFimiproxy(exitProcess = true) {
  const {httpProxy, httpsProxy} = getArtifacts();
  const conjoinedPromise = getConjoinedPromise({
    settlementType: kConjoinedPromiseSettlementType.allSettled,
  });

  const p1 = httpProxy && conjoinedPromise.newDeferred();
  const p2 = httpsProxy && conjoinedPromise.newDeferred();

  if (httpProxy) {
    gracefulShutdown(httpProxy, {
      forceExit: false,
      onShutdown: () => {
        p1?.resolve();
        return Promise.resolve();
      },
    });
  }

  if (httpsProxy) {
    gracefulShutdown(httpsProxy, {
      forceExit: false,
      onShutdown: () => {
        p2?.resolve();
        return Promise.resolve();
      },
    });
  }

  conjoinedPromise.start();
  conjoinedPromise.deferredPromise.promise.finally(() => {
    clearArtifacts();
    clearRoutes();
    console.log('fimiproxy ended');

    if (exitProcess) {
      // eslint-disable-next-line no-process-exit
      process.exit();
    }
  });
}
