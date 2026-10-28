import type { CatcherMessage } from '@hawk.so/types';
import process from 'node:process';
import type { MockInstance } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ServerModule from '../src/server/index';
import { createToken } from './helpers';

const token = createToken('server-test');
const defaultEndpoint = 'https://server-test.k1.hawk.so/';

/**
 * Request context of `onRequestError`
 */
const requestContext = {
  routerKind: 'App Router',
  routePath: '/server-error',
  routeType: 'render',
  revalidateReason: undefined,
};

/**
 * Failed request of `onRequestError`
 */
const request = {
  path: '/server-error',
  method: 'GET',
  headers: { 'user-agent': 'test' },
};

/**
 * Imports a fresh copy of the server build with an empty global state
 */
async function importServer(): Promise<typeof ServerModule> {
  vi.resetModules();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('hawk.nextjs')];

  return import('../src/server/index');
}

/**
 * Replaces global fetch with a mock answering like the collector
 */
function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{"code":200,"error":false,"message":"OK"}')));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/**
 * Returns events posted to the collector
 * @param fetchMock - mocked fetch
 */
function getEvents(fetchMock: ReturnType<typeof vi.fn>): [string, CatcherMessage<'errors/nodejs'>][] {
  return (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => [url, JSON.parse(init.body as string) as CatcherMessage<'errors/nodejs'>]);
}

/**
 * Returns URL and the event posted to the collector
 * @param fetchMock - mocked fetch
 * @param index - position of the event among the posted ones
 */
function getEvent(fetchMock: ReturnType<typeof vi.fn>, index = 0): [string, CatcherMessage<'errors/nodejs'>] {
  return getEvents(fetchMock)[index];
}

describe('server catcher', () => {
  let Hawk: typeof ServerModule;
  let processOn: MockInstance<typeof process.on>;

  beforeEach(async () => {
    vi.stubEnv('HAWK_TOKEN', '');
    vi.stubEnv('NEXT_PUBLIC_HAWK_TOKEN', '');
    vi.stubEnv('HAWK_RELEASE', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    processOn = vi.spyOn(process, 'on').mockReturnValue(process);
    Hawk = await importServer();
  });

  it('sends errors to the collector with the release and Next.js data', async () => {
    const fetchMock = mockFetch();

    Hawk.init({
      token,
      release: '1.2.3',
      context: { app: 'example' },
    });
    Hawk.send(new TypeError('x is undefined'), { orderId: 42 });

    await expect(Hawk.flush()).resolves.toBe(true);

    const [url, event] = getEvent(fetchMock);

    expect(url).toBe(defaultEndpoint);
    expect(event.token).toBe(token);
    expect(event.catcherType).toBe('errors/nodejs');
    expect(event.payload).toMatchObject({
      title: 'x is undefined',
      type: 'TypeError',
      release: '1.2.3',
      context: {
        app: 'example',
        orderId: 42,
      },
      addons: { nextjs: { runtime: 'nodejs' } },
    });
    expect(event.payload.backtrace?.length).toBeGreaterThan(0);
    expect(event.payload.user).toBeUndefined();
  });

  it('parses the stack trace without downloading the sources of the frames', async () => {
    const fetchMock = mockFetch();
    const error = new Error('dev error');

    error.stack = 'Error: dev error\n    at Page (file:///app/.next/server/chunks/ssr/page.js:3:7)\n    at render (/app/node_modules/next/dist/server/app-render.js:10:2)';

    Hawk.init({ token });
    Hawk.send(error);
    await Hawk.flush();

    expect(getEvents(fetchMock)).toHaveLength(1);
    expect(getEvent(fetchMock)[1].payload.backtrace).toEqual([
      {
        file: 'file:///app/.next/server/chunks/ssr/page.js',
        line: 3,
        column: 7,
        function: 'Page',
      },
      {
        file: '/app/node_modules/next/dist/server/app-render.js',
        line: 10,
        column: 2,
        function: 'render',
      },
    ]);
  });

  it('takes the token and the release from the environment', async () => {
    const fetchMock = mockFetch();

    vi.stubEnv('NEXT_PUBLIC_HAWK_TOKEN', token);
    vi.stubEnv('HAWK_RELEASE', 'env-release');

    Hawk.init();
    Hawk.send(new Error('from env'));
    await Hawk.flush();

    expect(getEvent(fetchMock)[1].payload.release).toBe('env-release');
  });

  it('sends the user passed with the error only', async () => {
    const fetchMock = mockFetch();

    Hawk.init({ token });
    Hawk.setUser({ id: 'ignored' });
    Hawk.send(new Error('with user'), undefined, { id: 'user-1' });
    Hawk.send(new Error('without user'));
    await Hawk.flush();

    const events = [getEvent(fetchMock, 0)[1], getEvent(fetchMock, 1)[1]];

    expect(events.find(event => event.payload.title === 'with user')?.payload.user).toEqual({ id: 'user-1' });
    expect(events.find(event => event.payload.title === 'without user')?.payload.user).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('setUser() is ignored on the server'));
  });

  it('skips Next.js control flow errors', async () => {
    const fetchMock = mockFetch();

    Hawk.init({ token });
    Hawk.send(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/;307;' }));
    await Hawk.onRequestError(Object.assign(new Error('not found'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }), request, requestContext);
    await Hawk.flush();

    expect(getEvents(fetchMock)).toHaveLength(0);
  });

  it('sends request errors with route data and waits for the delivery', async () => {
    let deliver: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      deliver = resolve;
    }));

    vi.stubGlobal('fetch', fetchMock);
    Hawk.init({ token });

    let isFinished = false;
    const sending = Hawk.onRequestError(Object.assign(new Error('render failed'), { digest: '123' }), request, requestContext).then(() => {
      isFinished = true;
    });

    await vi.waitFor(() => expect(getEvents(fetchMock)).toHaveLength(1));
    expect(isFinished).toBe(false);

    deliver(new Response('{}'));
    await sending;

    expect(getEvent(fetchMock)[1].payload.addons).toEqual({
      nextjs: {
        runtime: 'nodejs',
        digest: '123',
        routerKind: 'App Router',
        routePath: '/server-error',
        routeType: 'render',
        method: 'GET',
        path: '/server-error',
        headers: { 'user-agent': 'test' },
      },
    });
  });

  it('passes request errors to waitUntil of the request context', async () => {
    mockFetch();

    const waitUntil = vi.fn();

    vi.stubGlobal(Symbol.for('@next/request-context'), { get: () => ({ waitUntil }) });
    Hawk.init({ token });
    await Hawk.onRequestError(new Error('render failed'), request, requestContext);

    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it('stops waiting for the delivery after the timeout', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));

    vi.stubGlobal('fetch', fetchMock);
    Hawk.init({ token });
    Hawk.send(new Error('hanging'));

    await vi.waitFor(() => expect(getEvents(fetchMock)).toHaveLength(1));
    await expect(Hawk.flush(10)).resolves.toBe(false);
  });

  it('applies beforeSend and the collector endpoint overwrite', async () => {
    const fetchMock = mockFetch();

    Hawk.init({
      token: 'self-hosted',
      collectorEndpoint: 'https://collector.test/',
      beforeSend: event => (event.title === 'drop me' ? false : event),
    });
    Hawk.send(new Error('drop me'));
    Hawk.send(new Error('keep me'));
    await Hawk.flush();

    const [url, event] = getEvent(fetchMock);

    expect(getEvents(fetchMock)).toHaveLength(1);
    expect(url).toBe('https://collector.test/');
    expect(event.payload.title).toBe('keep me');
  });

  it('does nothing without a valid token', async () => {
    const fetchMock = mockFetch();

    Hawk.init();
    Hawk.send(new Error('no token'));
    Hawk.init({ token: 'invalid' });
    Hawk.send(new Error('invalid token'));

    await expect(Hawk.flush()).resolves.toBe(false);
    expect(getEvents(fetchMock)).toHaveLength(0);
    expect(processOn).not.toHaveBeenCalled();
  });

  it('creates the catcher once and handles process errors', async () => {
    const fetchMock = mockFetch();

    Hawk.init({ token });
    Hawk.init({ token });

    expect(processOn.mock.calls.map(([event]) => event)).toEqual(['uncaughtException', 'unhandledRejection']);

    vi.spyOn(process, 'listenerCount').mockReturnValue(2);

    const [, onRejection] = processOn.mock.calls[1] as [string, (reason: unknown) => void];

    onRejection(new Error('unhandled'));
    await vi.waitFor(() => expect(getEvents(fetchMock)).toHaveLength(1));

    expect(getEvent(fetchMock)[1].payload.title).toBe('unhandled');
  });

  it('skips process handlers when global errors handling is disabled', () => {
    Hawk.init({
      token,
      disableGlobalErrorsHandling: true,
    });

    expect(processOn).not.toHaveBeenCalled();
  });
});

describe('edge catcher', () => {
  it('sends events with the edge runtime and without process handlers', async () => {
    vi.resetModules();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('hawk.nextjs')];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const processOn = vi.spyOn(process, 'on').mockReturnValue(process);
    const fetchMock = mockFetch();
    const Edge = await import('../src/server/edge');

    Edge.init({ token });
    Edge.send(new Error('edge error'));
    await Edge.flush();

    expect(getEvent(fetchMock)[1].payload.addons).toEqual({ nextjs: { runtime: 'edge' } });
    expect(processOn).not.toHaveBeenCalled();
  });
});
