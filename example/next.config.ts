import { withHawkConfig } from '@hawk.so/nextjs';
import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    /**
     * Needed only because the example lives inside the plugin repository
     */
    root: path.resolve(process.cwd(), '..'),

    /**
     * Lets the e2e test check indexed source maps produced with debug ids
     */
    debugIds: process.env.HAWK_E2E_DEBUG_IDS === '1',
  },
};

export default withHawkConfig(nextConfig, {
  token: process.env.HAWK_TOKEN,
  collectorEndpoint: process.env.HAWK_COLLECTOR_ENDPOINT,
});
