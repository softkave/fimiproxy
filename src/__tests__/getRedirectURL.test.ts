import {describe, expect, it} from 'vitest';
import {getRedirectURL} from '../proxy/getRedirectURL.js';
import type {ProxyRedirectOverride, WorkingProxy} from '../proxy/types.js';
import type {FimiproxyRedirectURLSpecificParts} from '../types.js';

describe('getRedirectURL', () => {
  const createWorkingProxy = (
    overrides: Partial<WorkingProxy> = {},
  ): WorkingProxy => ({
    protocol: 'https:',
    incomingURL: new URL('https://example.com/path?query=value#hash'),
    config: {
      redirectHost: 'redirect.example.com',
      redirectURLParts: true,
    },
    destination: {
      origin: [
        {
          originHost: 'example.com',
          originPort: 443,
          originProtocol: 'https:',
        },
      ],
      incomingHostAndPort: 'example.com',
      redirectHost: 'redirect.example.com',
      redirectURLParts: true,
    },
    host: 'example.com',
    end: false,
    ...overrides,
  });

  it('should return null when no redirect host is available', () => {
    const workingProxy = createWorkingProxy({
      config: {
        redirectHost: undefined,
        redirectURLParts: true,
      },
      destination: {
        origin: [
          {
            originHost: 'example.com',
            originPort: 443,
            originProtocol: 'https:',
          },
        ],
        incomingHostAndPort: 'example.com',
        redirectHost: undefined,
        redirectURLParts: true,
      },
    });
    expect(getRedirectURL(workingProxy)).toBeNull();
  });

  it('should use config redirectHost when no destination is provided', () => {
    const workingProxy = createWorkingProxy({
      destination: null,
    });
    const result = getRedirectURL(workingProxy);
    expect(result).toBe('https://redirect.example.com/path?query=value');
  });

  it('should use destination redirectHost when available', () => {
    const workingProxy = createWorkingProxy({
      destination: {
        origin: [
          {
            originHost: 'example.com',
            originPort: 443,
            originProtocol: 'https:',
          },
        ],
        incomingHostAndPort: 'example.com',
        redirectHost: 'dest.example.com',
        redirectURLParts: true,
      },
    });
    const result = getRedirectURL(workingProxy);
    expect(result).toBe('https://dest.example.com/path?query=value');
  });

  it('should use incoming host when allowRedirectToIncomingHost is true and no redirect host is available', () => {
    const workingProxy = createWorkingProxy({
      config: {
        redirectHost: undefined,
        redirectURLParts: true,
      },
      destination: null,
    });
    const override: ProxyRedirectOverride = {
      allowRedirectToIncomingHost: true,
    };
    const result = getRedirectURL(workingProxy, override);
    expect(result).toBe('https://example.com/path?query=value');
  });

  it('should handle specific URL parts redirection', () => {
    const redirectParts: FimiproxyRedirectURLSpecificParts = {
      pathname: true,
      search: false,
      username: false,
      password: false,
    };
    const workingProxy = createWorkingProxy({
      config: {
        redirectHost: 'redirect.example.com',
        redirectURLParts: redirectParts,
      },
      destination: null,
    });
    const result = getRedirectURL(workingProxy);
    expect(result).toBe('https://redirect.example.com/path');
  });

  it('should handle custom protocol override', () => {
    const workingProxy = createWorkingProxy();
    const override: ProxyRedirectOverride = {
      redirectProtocol: 'http:',
    };
    const result = getRedirectURL(workingProxy, override);
    expect(result).toBe('http://redirect.example.com/path?query=value');
  });

  it('should handle URL with credentials', () => {
    const workingProxy = createWorkingProxy({
      incomingURL: new URL('https://user:pass@example.com/path'),
      config: {
        redirectHost: 'redirect.example.com',
        redirectURLParts: {
          username: true,
          password: true,
          pathname: true,
        },
      },
    });
    const result = getRedirectURL(workingProxy);
    expect(result).toBe('https://user:pass@redirect.example.com/path');
  });
});
