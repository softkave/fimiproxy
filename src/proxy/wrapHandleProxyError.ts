import {IncomingMessage, ServerResponse, STATUS_CODES} from 'http';
import {ProxyError} from '../error/ProxyError.js';

export function wrapHandleProxyError(
  fn: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage> & {req: IncomingMessage}
  ) => void | Promise<void>
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage> & {req: IncomingMessage}
  ) => {
    try {
      await fn(req, res);
    } catch (error: unknown) {
      let code = 500;
      let pError: ProxyError | undefined;

      if (ProxyError.isProxyError(error)) {
        code = error.code;
        pError = error;
      }

      res.writeHead(code, {'Content-Type': 'text/plain'});
      res.end(STATUS_CODES[code]);

      console.log(pError?.assertionMessage || 'error proxying req');
      console.error(error);
    }
  };
}
