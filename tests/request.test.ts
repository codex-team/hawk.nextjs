import { describe, expect, it } from 'vitest';
import { normalizeError } from '../src/common/error';
import { getRequestAddons } from '../src/common/request';

describe('getRequestAddons', () => {
  it('returns route data and the request without credentials', () => {
    const error = Object.assign(new Error('failed'), { digest: '2338541376' });
    const addons = getRequestAddons(error, {
      path: '/blog/hello?ref=home',
      method: 'GET',
      headers: {
        host: 'example.com',
        'user-agent': 'Mozilla/5.0',
        referer: ['https://example.com/', 'https://example.com/blog'],
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        'x-forwarded-for': '203.0.113.1',
      },
    }, {
      routerKind: 'App Router',
      routePath: '/blog/[slug]',
      routeType: 'render',
      renderSource: 'react-server-components',
      revalidateReason: undefined,
    });

    expect(addons).toEqual({
      digest: '2338541376',
      routerKind: 'App Router',
      routePath: '/blog/[slug]',
      routeType: 'render',
      renderSource: 'react-server-components',
      method: 'GET',
      path: '/blog/hello?ref=home',
      headers: {
        host: 'example.com',
        referer: 'https://example.com/, https://example.com/blog',
        'user-agent': 'Mozilla/5.0',
      },
    });
  });
});

describe('normalizeError', () => {
  it('keeps errors and messages', () => {
    const error = new Error('failed');

    expect(normalizeError(error)).toBe(error);
    expect(normalizeError('message')).toBe('message');
  });

  it('copies errors from another realm to keep the stack trace', () => {
    const foreign = {
      name: 'TypeError',
      message: 'x is undefined',
      stack: 'TypeError: x is undefined\n    at page (/app/.next/server/chunks/page.js:1:2)',
    };
    const error = normalizeError(foreign);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject(foreign);
  });

  it('serializes other thrown values', () => {
    expect(normalizeError({ reason: 'timeout' })).toBe('{"reason":"timeout"}');
    expect(normalizeError(undefined)).toBe('undefined');
  });
});
