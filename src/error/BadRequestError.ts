import {ProxyError} from './ProxyError.js';

export class BadRequestError extends ProxyError {
  statusCode = 400;
}
