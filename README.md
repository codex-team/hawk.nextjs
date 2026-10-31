# Hawk Next.js

Error tracking for Next.js apps with [Hawk](https://hawk.so). Catches errors in the browser, on the server and in the Edge runtime, and sends releases with source maps, so errors from the browser show the original source code instead of minified chunks.

- 🐞 Errors from the browser, Node.js and Edge runtimes with one import
- 🧭 Errors of server components, route handlers, server actions and middleware with the route data
- 🧱 Ready error pages and error boundary for React
- 🙅 `redirect()`, `notFound()` and other Next.js control flow errors are skipped
- ⏱️ Events are delivered before serverless functions are frozen
- 🌟 Client source maps sending
- ⚡ Turbopack and webpack support
- 🏷️ Automatic release id from CI, git or build time
- 💬 Recent commits sending
- 🙈 Source maps removal after sending, so the source code is not published
- 🛡️ Build never fails because of sending errors

## Install

```shell
yarn add @hawk.so/nextjs
```

Install it as a regular dependency, not with `-D`: `next start` loads `next.config` too, and fails with `Cannot find module '@hawk.so/nextjs/config'` when production installs skip dev dependencies.

## Connect

Put your project's Integration Token to the `NEXT_PUBLIC_HAWK_TOKEN` environment variable of the build, e.g. in `.env`:

```shell
NEXT_PUBLIC_HAWK_TOKEN=eyJpbnRlZ3JhdGlvbklk...
```

The plugin and the catchers read the same variable. The browser catcher has the token in the client code anyway, and Next.js inlines `NEXT_PUBLIC_` variables during the build, so the running app needs no Hawk variables.

Then add three files. Releases with source maps are sent from the Next.js config, see [Sending releases](#sending-releases).

**1. `instrumentation-client.ts`** in the project root (or in `src`) catches errors in the browser. Next.js runs it before the app starts:

```ts
import * as Hawk from '@hawk.so/nextjs';

Hawk.init();

export const onRouterTransitionStart = Hawk.onRouterTransitionStart;
```

**2. `instrumentation.ts`** catches errors on the server, in Node.js and Edge runtimes:

```ts
import * as Hawk from '@hawk.so/nextjs';

export function register() {
  Hawk.init();
}

export const onRequestError = Hawk.onRequestError;
```

**3. `app/global-error.tsx`** catches errors of the root layout and shows a minimal error page:

```tsx
'use client';

export { HawkGlobalError as default } from '@hawk.so/nextjs';
```

Next.js only logs errors shown by error pages, so send them from your `error.tsx` files with `useHawkError`:

```tsx
'use client';

import { useHawkError } from '@hawk.so/nextjs';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useHawkError(error);

  return <button type="button" onClick={reset}>Try again</button>;
}
```

See the [example](./example) app with all of them.

## What is caught

| Error | Caught by |
| -- | -- |
| Browser: event handlers, effects, timers, unhandled rejections | `init()` in `instrumentation-client.ts` |
| Errors shown by `error.tsx` | `useHawkError(error)` |
| Errors of the root layout | `HawkGlobalError` in `global-error.tsx` |
| Errors of a component tree | `<HawkErrorBoundary>` |
| Server components, route handlers, server actions, middleware | `onRequestError` in `instrumentation.ts` |
| Uncaught exceptions and unhandled rejections of the Node.js server | `init()` in `instrumentation.ts` |
| Errors you catch yourself | `Hawk.send(error)` |

Next.js uses errors for `redirect()`, `notFound()`, `forbidden()` and dynamic rendering bailouts. They are part of the normal flow and are not sent.

Server errors reach the error pages in the browser with a `digest` and a generic message in production. They are already sent from the server, so `useHawkError` and the boundaries skip them. The server event has the same digest in `addons.nextjs.digest`, so you can find it by the digest shown on the page.

## API

All functions are imported from `@hawk.so/nextjs` and work in the browser, on the server and in the Edge runtime: Next.js picks the build for each runtime.

| name | description |
| -- | -- |
| `init(options?)` | Creates the catcher. Call it in `instrumentation-client.ts` and in `register()` of `instrumentation.ts`. See [options](#init-options) |
| `send(error, context?, user?)` | Sends an error or a message. `user` is used on the server only, in the browser use `setUser()` |
| `setUser(user)`, `clearUser()` | Sets the user sent with every event, in the browser only |
| `setContext(context)` | Sets data sent with every event. On the server it is shared by all requests of the process |
| `breadcrumbs.add(breadcrumb)`, `.get()`, `.clear()` | Actions that happened before the error, in the browser only. Clicks, requests and navigations are added automatically |
| `flush(timeout?)` | Waits for the events being sent, 2 seconds at most by default. Resolves with `false` on timeout |
| `onRequestError` | Export it from `instrumentation.ts` to send errors of server components, route handlers, server actions and middleware |
| `onRouterTransitionStart` | Export it from `instrumentation-client.ts` to add a breadcrumb for every navigation |
| `useHawkError(error)` | Sends the error passed to `error.tsx` |
| `HawkGlobalError` | Ready `global-error.tsx` |
| `HawkErrorBoundary` | Error boundary that sends errors of its children. Props: `fallback` (element or `({ error, reset }) => element`) and `onError(error, info)` |

```tsx
<HawkErrorBoundary fallback={({ reset }) => <button onClick={reset}>Reload the widget</button>}>
  <Widget />
</HawkErrorBoundary>
```

### Init options

| name | type | description |
| -- | -- | -- |
| `token` | string | Integration Token. Default is the `NEXT_PUBLIC_HAWK_TOKEN` environment variable, on the server `HAWK_TOKEN` is checked first. Without a token nothing is sent |
| `release` | string | Release id. Default is `process.env.HAWK_RELEASE` set by the plugin, see [Release id](#release-id) |
| `context` | object | Data sent with every event |
| `beforeSend` | function | Filters or modifies events. Return the event to send it or `false` to drop it |
| `disableGlobalErrorsHandling` | boolean | Disables catching of uncaught errors and unhandled rejections |
| `collectorEndpoint` | string | Collector endpoint for self-hosted Hawk: WebSocket URL in the browser, HTTP URL on the server |
| `user` | object | Current user, in the browser only |
| `breadcrumbs` | false/object | Breadcrumbs options of [@hawk.so/browser](https://github.com/codex-team/hawk.javascript/tree/master/packages/browser), in the browser only |
| `consoleTracking` | boolean | Sends recent console output with the events, in the browser only. Default is `true` |
| `issues` | false/object | Web Vitals and long tasks detection of [@hawk.so/browser](https://github.com/codex-team/hawk.javascript/tree/master/packages/browser), in the browser only |

Pass different options to the browser and the server by calling `init()` with them in each file.

### On the server

- The server handles requests of many users at once, so there is no current user: `setUser()` is ignored. Pass the user with the event instead: `Hawk.send(error, { orderId }, { id: user.id })`.
- `onRequestError` waits for sending and passes it to `waitUntil` where the platform supports it, e.g. on Vercel. If you call `send()` right before a serverless function returns, wait for it with `await Hawk.flush()`.
- Events have Next.js data in `addons.nextjs`: `runtime`, `routerKind`, `routePath`, `routeType`, `method`, `path`, `digest` and the `host`, `referer` and `user-agent` headers. Cookies, authorization and IP addresses are not sent.
- The Edge runtime has no process events, so only errors passed to `onRequestError` and `send()` are sent. `next start` passes errors of Edge routes to `onRequestError` of the Node.js runtime.
- Hawk doesn't apply source maps to server errors yet, so their stack traces point to the compiled files in `.next/server`.

## Sending releases

> [!IMPORTANT]
> We strongly recommend setting up release sending. With the source maps from the release, Hawk shows fragments of your source code around browser errors instead of minified bundle chunks. Without this, it is awkward and difficult to understand the problem.

`withHawkConfig` sends the release on `next build`. Put it in `next.config.ts`, `next.config.mjs` or `next.config.js`: import it from `@hawk.so/nextjs/config` and wrap the config you export.

```ts
import type { NextConfig } from 'next';
import { withHawkConfig } from '@hawk.so/nextjs/config';

const nextConfig: NextConfig = {
  // your config
};

export default withHawkConfig(nextConfig);
```

If the file exports a function, wrap that function the same way: `export default withHawkConfig((phase, { defaultConfig }) => ({ ... }), options)`.

On `next build` the plugin:

1. resolves the release id and exposes it to your code as `process.env.HAWK_RELEASE`
2. enables client source maps (`productionBrowserSourceMaps`) unless you set it yourself
3. after compilation sends recent commits and client source maps to Hawk
4. removes client source maps and `sourceMappingURL` comments from `.next/static`, so the source code is not published

`next dev` sends nothing.

### Plugin options

They apply only to the release sent from this file. Pass them as the second argument of `withHawkConfig`:

```ts
export default withHawkConfig(nextConfig, {
  commits: false,
});
```

| name | type | required | description |
| -- | -- | -- | -- |
| `token` | string | optional | Your project's Integration Token. Default is the `HAWK_TOKEN` or `NEXT_PUBLIC_HAWK_TOKEN` environment variable. Without a token the release is not sent |
| `release` | string/number | optional | Unique identifier of the release. See [Release id](#release-id) |
| `removeSourceMaps` | boolean | optional | Shows if the plugin should remove client source maps after sending. Default is `true` |
| `commits` | boolean/object | optional | Sends recent commits with the release. Default is `true`. Pass `false` to disable or `{ repo, number }` to set the path to the git repository (default is the project directory) and the number of commits (default is `5`) |

### Release id

Release id links error events to the source maps and commits sent from the build. The plugin picks it once per build, in this order:

1. `release` option
2. `HAWK_RELEASE` environment variable
3. commit SHA from the CI environment: GitHub Actions (`GITHUB_SHA`), GitLab CI (`CI_COMMIT_SHA`), Vercel (`VERCEL_GIT_COMMIT_SHA`), Netlify, Cloudflare Pages, CircleCI and [others](./src/config/release.ts)
4. current commit: `git rev-parse HEAD`
5. build start time, e.g. `2026-10-27T18:30:00.000Z`

Whatever is picked, the source maps and your code get the same value: the plugin inlines it into the build as `process.env.HAWK_RELEASE`, and `init()` takes it from there. You don't need to set this variable when the app runs.

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

### TypeScript

`process.env.HAWK_RELEASE` is typed automatically when you import the package. If your config is a JavaScript file and you don't import the package in TypeScript files, add the declaration to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@hawk.so/nextjs/global"]
  }
}
```

## Migration from Hawk catchers

If you connected `@hawk.so/browser` and `@hawk.so/nodejs` yourself:

1. In `next.config.ts` (or `.js` / `.mjs`), wrap the exported config with `withHawkConfig` from `@hawk.so/nextjs/config`. See [Sending releases](#sending-releases).
2. Replace the catchers in `instrumentation-client.ts` and `instrumentation.ts` with the files from [Connect](#connect).
3. Replace `reportError(error)` in `error.tsx` with `useHawkError(error)`.
4. Remove `@hawk.so/browser` and `@hawk.so/nodejs` from your dependencies, and `HAWK_TOKEN` if it has the same value as `NEXT_PUBLIC_HAWK_TOKEN`.

## Requirements

- Next.js 15.4.1 or newer: the plugin uses the `compiler.runAfterProductionCompile` build hook
- React 18.2 or newer
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
yarn e2e      # build and start the example app, check the release and the events received by a mock collector
```

`yarn e2e` opens the example in Chromium, install it once with `yarn playwright install chromium`. `yarn e2e --debug-ids` checks indexed source maps produced with `turbopack.debugIds`, `yarn e2e --webpack` checks the webpack build.
