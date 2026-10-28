import { describe, expect, it, vi } from 'vitest';
import type { Collector } from '../src/config/uploader';
import { sendCommits, sendSourceMap } from '../src/config/uploader';

const collector: Collector = {
  endpoint: 'https://collector.test/release',
  token: 'token',
  release: '1.0.0',
  timeout: 1000,
};

/**
 * Replaces global fetch with a mock returning the given response
 * @param body - response body
 * @param status - HTTP status
 */
function mockFetch(body: string, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(body, { status })));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/**
 * Returns URL and options of the first fetch call
 * @param fetchMock - mocked fetch
 */
function getRequest(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe('sendSourceMap', () => {
  it('posts the map as a multipart file with release and token', async () => {
    const fetchMock = mockFetch('{"code":200,"error":false,"message":"OK"}');

    await sendSourceMap(collector, '0a1b2c.js.map', '{"version":3}');

    const [url, init] = getRequest(fetchMock);
    const body = init.body as FormData;
    const file = body.get('file') as File;

    expect(url).toBe(collector.endpoint);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
    expect(body.get('release')).toBe('1.0.0');
    expect(file.name).toBe('0a1b2c.js.map');
    expect(await file.text()).toBe('{"version":3}');
  });

  it('fails when the collector replies with error flag and HTTP 200', async () => {
    mockFetch('{"code":0,"error":true,"message":"Request is too large"}');

    await expect(sendSourceMap(collector, 'a.js.map', '{}')).rejects.toThrow('Request is too large');
  });

  it('fails on non-JSON responses', async () => {
    mockFetch('Too Many Requests', 429);

    await expect(sendSourceMap(collector, 'a.js.map', '{}')).rejects.toThrow('Unexpected collector response (HTTP 429): Too Many Requests');
  });

  it('hides the token secret from the invalid token message', async () => {
    mockFetch('{"code":400,"error":true,"message":"Integration token invalid: 123secret"}', 400);

    await expect(sendSourceMap(collector, 'a.js.map', '{}')).rejects.toThrow(/^Integration token invalid$/);
  });
});

describe('sendCommits', () => {
  it('posts commits as JSON', async () => {
    const fetchMock = mockFetch('{"code":200,"error":false,"message":"OK"}');
    const commits = [{
      hash: 'abc',
      title: 'Initial commit',
      author: 'dev@example.com',
      date: '2026-10-21T22:01:52+03:00',
    }];

    await sendCommits(collector, commits);

    const body = getRequest(fetchMock)[1].body as FormData;

    expect(body.get('release')).toBe('1.0.0');
    expect(JSON.parse(body.get('commits') as string)).toEqual(commits);
  });
});
