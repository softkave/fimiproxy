export class ProxyError extends Error {
  static isProxyError(error: unknown): error is ProxyError {
    return !!(error as ProxyError | undefined)?.code;
  }

  code = 500;
  assertionMessage: string;

  constructor(props: {message?: string; assertionMessage: string}) {
    super(props.message);
    this.assertionMessage = props.assertionMessage;
  }
}