import * as Hawk from '@hawk.so/nextjs';

/**
 * Catches errors in the browser. The token is taken from NEXT_PUBLIC_HAWK_TOKEN
 */
Hawk.init({
  /**
   * Lets the e2e test send events to the mock collector
   */
  collectorEndpoint: process.env.NEXT_PUBLIC_HAWK_E2E_WS_ENDPOINT,
});

/**
 * Adds a breadcrumb for every navigation
 */
export const onRouterTransitionStart = Hawk.onRouterTransitionStart;
