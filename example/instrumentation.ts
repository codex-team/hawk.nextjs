import * as Hawk from '@hawk.so/nextjs';

/**
 * Catches errors in the Node.js and Edge runtimes. The token is taken from NEXT_PUBLIC_HAWK_TOKEN
 */
export function register(): void {
  Hawk.init({
    /**
     * Lets the e2e test send events to the mock collector
     */
    collectorEndpoint: process.env.HAWK_E2E_HTTP_ENDPOINT,
  });
}

/**
 * Sends errors of server components, route handlers, server actions and middleware
 */
export const onRequestError = Hawk.onRequestError;
