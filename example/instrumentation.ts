import type { Instrumentation } from 'next';

/**
 * Initializes the Node.js Catcher when the server starts.
 * The catcher is imported dynamically to keep it out of the Edge runtime bundle
 */
export async function register(): Promise<void> {
  const token = process.env.NEXT_PUBLIC_HAWK_TOKEN;

  if (process.env.NEXT_RUNTIME !== 'nodejs' || token === undefined || token === '') {
    return;
  }

  const { default: HawkCatcher } = await import('@hawk.so/nodejs');

  HawkCatcher.init({
    token,
    release: process.env.HAWK_RELEASE,
  });
}

/**
 * Next.js handles errors of server components, route handlers and server actions itself,
 * so they don't reach the global `uncaughtException` handler and are sent from here
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { default: HawkCatcher } = await import('@hawk.so/nodejs');

  HawkCatcher.send(error as Error, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
