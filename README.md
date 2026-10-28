# Hawk Next.js

Sends releases with source maps from Next.js builds to [Hawk](https://hawk.so), so errors from the browser show the original source code instead of minified chunks.

- 🌟 Client source maps sending
- ⚡ Turbopack and webpack support
- 🏷️ Automatic release id from CI, git or build time
- 💬 Recent commits sending
- 🙈 Source maps removal after sending, so the source code is not published
- 🧩 One-line setup in `next.config`
- 🛡️ Build never fails because of sending errors

The package only sends releases, it doesn't catch errors. Use Hawk catchers for that, see [Error tracking](#error-tracking).

## Install

```shell
yarn add @hawk.so/nextjs
```

Install it as a regular dependency, not with `-D`: `next start` loads `next.config` too, and fails with `Cannot find module '@hawk.so/nextjs'` when production installs skip dev dependencies.

## Connect

Wrap your Next.js config with `withHawkConfig`:

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withHawkConfig } from '@hawk.so/nextjs';

const nextConfig: NextConfig = {
  // your config
};

export default withHawkConfig(nextConfig, {
  token: process.env.HAWK_TOKEN, // Your project's Integration Token
});
```

Config functions are supported as well: `withHawkConfig((phase, { defaultConfig }) => ({ ... }), options)`.

On `next build` the plugin:

1. resolves the release id and exposes it to your code as `process.env.HAWK_RELEASE`
2. enables client source maps (`productionBrowserSourceMaps`) unless you set it yourself
3. after compilation sends recent commits and client source maps to Hawk
4. removes client source maps and `sourceMappingURL` comments from `.next/static`, so the source code is not published

`next dev` sends nothing.

### Plugin options

| name | type | required | description |
| -- | -- | -- | -- |
| `token` | string | optional | Your project's Integration Token. Default is the `HAWK_TOKEN` environment variable. Without a token the release is not sent |
| `release` | string/number | optional | Unique identifier of the release. See [Release id](#release-id) |
| `removeSourceMaps` | boolean | optional | Shows if the plugin should remove client source maps after sending. Default is `true` |
| `commits` | boolean/object | optional | Sends recent commits with the release. Default is `true`. Pass `false` to disable or `{ repo, number }` to set the path to the git repository (default is the project directory) and the number of commits (default is `5`) |

### Release id

Release id links error events to the source maps and commits sent from the build. The plugin picks it once per build, in this order:

1. `release` option
2. `HAWK_RELEASE` environment variable
3. commit SHA from the CI environment: GitHub Actions (`GITHUB_SHA`), GitLab CI (`CI_COMMIT_SHA`), Vercel (`VERCEL_GIT_COMMIT_SHA`), Netlify, Cloudflare Pages, CircleCI and [others](./src/release.ts)
4. current commit: `git rev-parse HEAD`
5. build start time, e.g. `2026-10-27T18:30:00.000Z`

Whatever is picked, the source maps and your code get the same value: the plugin inlines it into the build as `process.env.HAWK_RELEASE`. You don't need to set this variable when the app runs, just pass it to the catchers, see [Error tracking](#error-tracking).

Production builds often run without git and CI variables, for example in a Docker build or a separate Kubernetes pod. Then the release is the build time. Source maps still work, but commits are not sent and the release name tells nothing about the deployed version. To get meaningful releases, pass the id from your pipeline with the `HAWK_RELEASE` environment variable:

```dockerfile
ARG HAWK_RELEASE
RUN yarn build
```

```shell
docker build --build-arg HAWK_RELEASE=$(git rev-parse HEAD) .
```

Or set the `release` option, for example to the version from `package.json`, which package managers expose while running `yarn build` or `npm run build`:

```ts
export default withHawkConfig(nextConfig, {
  release: process.env.npm_package_version,
});
```

A version is unique only if you bump it for every deploy, otherwise errors of different builds get into the same release.

## Error tracking

To catch errors, use the Hawk catchers with the release id from the plugin:

- [@hawk.so/javascript](https://github.com/codex-team/hawk.javascript) in the browser. Hawk applies the sent source maps to these errors.
- [@hawk.so/nodejs](https://github.com/codex-team/hawk.nodejs) on the server. Hawk doesn't apply source maps to server errors, so their stack traces point to the compiled files in `.next/server`.

```shell
yarn add @hawk.so/javascript @hawk.so/nodejs
```

Both catchers below take the Integration Token from `NEXT_PUBLIC_HAWK_TOKEN`. The browser catcher has the token in the client code anyway, and Next.js inlines `NEXT_PUBLIC_` variables during the build like `HAWK_RELEASE`, so the running app needs no Hawk variables.

### Browser

Create the catcher in `instrumentation-client.ts` in the project root (or in `src`). Next.js runs this file before the app starts, so the catcher gets errors from event handlers, effects and unhandled promise rejections.

```ts
// instrumentation-client.ts
import HawkCatcher from '@hawk.so/javascript';

const token = process.env.NEXT_PUBLIC_HAWK_TOKEN;

if (token) {
  new HawkCatcher({
    token,
    release: process.env.HAWK_RELEASE,
  });
}
```

Errors caught by your error boundaries (`error.tsx` and a custom `global-error.tsx`) are only logged to the console by Next.js. Report them with `reportError`, so the catcher gets them like uncaught errors:

```tsx
// app/error.tsx
'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors have a digest and are sent by the Node.js catcher
    if (error.digest === undefined) {
      reportError(error);
    }
  }, [error]);

  return <button type="button" onClick={reset}>Try again</button>;
}
```

### Server

Initialize the catcher in `instrumentation.ts` and send request errors from the `onRequestError` hook:

```ts
// instrumentation.ts
import type { Instrumentation } from 'next';

export async function register() {
  const token = process.env.NEXT_PUBLIC_HAWK_TOKEN;

  if (process.env.NEXT_RUNTIME === 'nodejs' && token) {
    const { default: HawkCatcher } = await import('@hawk.so/nodejs');

    HawkCatcher.init({
      token,
      release: process.env.HAWK_RELEASE,
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { default: HawkCatcher } = await import('@hawk.so/nodejs');

    HawkCatcher.send(error as Error, {
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    });
  }
};
```

- `register` runs once on server start. The catcher also handles `uncaughtException` and `unhandledRejection`.
- Next.js handles errors of server components, route handlers and server actions itself, so they reach the catcher only through `onRequestError`.
- `@hawk.so/nodejs` works only in the Node.js runtime. It is imported dynamically to keep it out of Edge bundles, so errors from the Edge runtime are not sent.

See the [example](./example) app with both catchers.

### TypeScript

`process.env.HAWK_RELEASE` is typed automatically when you import the plugin in `next.config.ts`. If your config is a JavaScript file, add the declaration to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@hawk.so/nextjs/global"]
  }
}
```

## Requirements

- Next.js 15.4.1 or newer: the plugin uses the `compiler.runAfterProductionCompile` build hook
- Node.js 20.9 or newer

## Notes

- Hawk applies source maps to errors from the browser, so only client source maps are sent. Server source maps in `.next/server` are left untouched.
- Releases are sent during the build. Make sure the build environment has the token and access to Hawk, and the build finishes before the new version gets traffic.
- When `experimental.sri` is enabled, `sourceMappingURL` comments are kept, since changing the files would break the integrity hashes.
- Sending errors never fail the build: they are printed to the build output.

## Development

```shell
yarn          # install dependencies
yarn lint     # ESLint
yarn test     # unit tests
yarn e2e      # build the example app and check what is sent to a mock collector
```

`yarn e2e --debug-ids` checks indexed source maps produced with `turbopack.debugIds`, `yarn e2e --webpack` checks the webpack build.
