// @vitest-environment happy-dom
import type { CatcherMessage } from '@hawk.so/types';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ClientModule from '../src/client/index';
import type { HawkEvent } from '../src/common/options';
import type { NextjsAddons } from '../src/common/request';
import { createToken } from './helpers';

const token = createToken('client-test');

/**
 * Transport mock collecting sent events
 */
interface TransportMock {
  /**
   * Sends the event
   */
  send: ReturnType<typeof vi.fn<(message: CatcherMessage<'errors/javascript'>) => Promise<void>>>;
}

/**
 * Imports a fresh copy of the browser build with an empty global state
 */
async function importClient(): Promise<typeof ClientModule> {
  vi.resetModules();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('hawk.nextjs')];

  return import('../src/client/index');
}

/**
 * Creates a transport mock
 */
function createTransport(): TransportMock {
  return { send: vi.fn(() => Promise.resolve()) };
}

/**
 * Returns titles of the sent events
 * @param transport - transport mock
 */
function getTitles(transport: TransportMock): string[] {
  return transport.send.mock.calls.map(([message]) => message.payload.title);
}

/**
 * Renders the element into a new container
 * @param element - React tree to mount
 */
function render(element: ReactNode): HTMLElement {
  const container = document.createElement('div');

  document.body.append(container);

  act(() => {
    createRoot(container).render(element);
  });

  return container;
}

/**
 * Component that throws during rendering
 * @param props - error to throw
 */
function Broken({ error }: { error: unknown }): never {
  throw error;
}

/**
 * Catches errors rethrown by `HawkErrorBoundary`, like the Next.js boundaries do
 */
class OuterBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  public override state = { error: null as unknown };

  public static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  public override render(): ReactNode {
    return this.state.error === null ? this.props.children : <p>outer: {String((this.state.error as Error).message)}</p>;
  }
}

describe('browser catcher', () => {
  let Hawk: typeof ClientModule;
  let transport: TransportMock;

  beforeEach(async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubEnv('NEXT_PUBLIC_HAWK_TOKEN', '');
    vi.stubEnv('HAWK_RELEASE', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    transport = createTransport();
    Hawk = await importClient();
  });

  it('sends errors with the token and the release from the environment', async () => {
    vi.stubEnv('NEXT_PUBLIC_HAWK_TOKEN', token);
    vi.stubEnv('HAWK_RELEASE', '1.2.3');

    Hawk.init({ transport });
    Hawk.send(new Error('manual'), { orderId: 42 });

    await vi.waitFor(() => expect(transport.send).toHaveBeenCalled());

    const [message] = transport.send.mock.calls[0];

    expect(message.token).toBe(token);
    expect(message.catcherType).toBe('errors/javascript');
    expect(message.payload).toMatchObject({
      title: 'manual',
      release: '1.2.3',
      context: { orderId: 42 },
    });
  });

  it('creates the catcher once', () => {
    Hawk.init({
      token,
      transport,
    });

    expect(() => Hawk.init({
      token,
      transport,
    })).not.toThrow();
  });

  it('does nothing without a token', async () => {
    Hawk.init({ transport });
    Hawk.send(new Error('no token'));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('drops Next.js control flow errors caught by the global handlers', async () => {
    const beforeSend = vi.fn((event: HawkEvent) => event);

    Hawk.init({
      token,
      transport,
      beforeSend,
    });

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('NEXT_REDIRECT;push;/login;307;') }));
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught') }));

    await vi.waitFor(() => expect(transport.send).toHaveBeenCalled());

    expect(getTitles(transport)).toEqual(['uncaught']);
    expect(beforeSend).toHaveBeenCalledTimes(1);
  });

  it('adds a breadcrumb for router transitions', () => {
    Hawk.init({
      token,
      transport,
    });
    Hawk.onRouterTransitionStart('/blog/hello', 'push');

    expect(Hawk.breadcrumbs.get()).toContainEqual(expect.objectContaining({
      type: 'navigation',
      category: 'next.router',
      message: '/blog/hello',
      data: { navigationType: 'push' },
    }));
  });

  it('sends errors of the error page, except server ones', async () => {
    Hawk.init({
      token,
      transport,
    });

    /**
     * Error page using the hook
     * @param props - error passed by Next.js
     */
    function ErrorPage({ error }: { error: unknown }): ReactNode {
      Hawk.useHawkError(error);

      return null;
    }

    render(<ErrorPage error={new Error('client render failed')} />);
    render(<ErrorPage error={Object.assign(new Error('server failed'), { digest: '2338541376' })} />);

    await vi.waitFor(() => expect(transport.send).toHaveBeenCalled());

    const [message] = transport.send.mock.calls[0];

    expect(getTitles(transport)).toEqual(['client render failed']);
    expect(message.payload.addons).toMatchObject({
      nextjs: {
        runtime: 'browser',
        boundary: 'error',
      },
    });
  });

  it('shows the fallback of the boundary and sends the error with the component stack', async () => {
    Hawk.init({
      token,
      transport,
    });

    const onError = vi.fn();
    const container = render(
      <Hawk.HawkErrorBoundary fallback={({ error }) => <p>fallback: {(error as Error).message}</p>} onError={onError}>
        <Broken error={new Error('component failed')} />
      </Hawk.HawkErrorBoundary>
    );

    await vi.waitFor(() => expect(transport.send).toHaveBeenCalled());

    const [message] = transport.send.mock.calls[0];

    const addons = message.payload.addons as { nextjs?: NextjsAddons } | undefined;
    const [error, info] = onError.mock.calls[0] as [Error, ErrorInfo];

    expect(container.textContent).toBe('fallback: component failed');
    expect(error.message).toBe('component failed');
    expect(info.componentStack).toContain('Broken');
    expect(addons?.nextjs?.boundary).toBe('boundary');
    expect(addons?.nextjs?.componentStack).toContain('Broken');
  });

  it('passes control flow errors to the parent boundaries', async () => {
    Hawk.init({
      token,
      transport,
    });

    const container = render(
      <OuterBoundary>
        <Hawk.HawkErrorBoundary fallback={<p>fallback</p>}>
          <Broken error={Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })} />
        </Hawk.HawkErrorBoundary>
      </OuterBoundary>
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(container.textContent).toBe('outer: NEXT_HTTP_ERROR_FALLBACK;404');
    expect(transport.send).not.toHaveBeenCalled();
  });
});
