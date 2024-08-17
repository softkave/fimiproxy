import {ProxyError} from './ProxyError.js';

export class BadRequestError extends ProxyError {
  code = 400;
}
