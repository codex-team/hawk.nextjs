# Hawk Next.js

Next.js integration for sending releases with source maps to [Hawk](https://hawk.so).

Works with Turbopack (the default bundler since Next.js 16) and webpack builds.

## Install

```shell
yarn add @hawk.so/nextjs
```

Install it as a regular dependency: `next.config` is loaded by `next start` as well, so the package must be available in production installs.

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
| `collectorEndpoint` | string | optional | Collector endpoint overwrite |

### Release id

Release id links errors to the source maps and commits sent from the build. You don't need to set it: the plugin picks it once per build, in this order:

1. `release` option
2. `HAWK_RELEASE` environment variable
3. commit SHA from the CI environment: GitHub Actions (`GITHUB_SHA`), GitLab CI (`CI_COMMIT_SHA`), Vercel (`VERCEL_GIT_COMMIT_SHA`), Netlify, Cloudflare Pages, CircleCI and [others](./src/release.ts)
4. current commit: `git rev-parse HEAD`
5. build start time, e.g. `2026-10-27T18:30:00.000Z`

So in most setups the release is the commit SHA: it is unique for every deployed version and the same in client and server code.

The plugin sends source maps and commits with this release and inlines it into your code as `process.env.HAWK_RELEASE`. You don't define this variable yourself, just pass it to the catcher, see [below](#connect-release-to-javascript-catcher).

Set your own release when you prefer another format, for example the version from `package.json`, which package managers expose while running `yarn build` or `npm run build`:

```ts
export default withHawkConfig(nextConfig, {
  release: process.env.npm_package_version,
});
```

Keep in mind that a version is unique only if you bump it for every deploy, otherwise errors of different builds get into the same release.

The release can also be set from the outside with the `HAWK_RELEASE` environment variable, e.g. `HAWK_RELEASE=$(git describe --tags) yarn build`. This is useful for Docker builds, which usually have neither `.git` nor CI variables and fall back to the build time:

```dockerfile
ARG HAWK_RELEASE
RUN yarn build
```

```shell
docker build --build-arg HAWK_RELEASE=$(git rev-parse HEAD) .
```

### Connect release to JavaScript catcher

Pass `process.env.HAWK_RELEASE` to the [JavaScript Catcher](https://github.com/codex-team/hawk.javascript) on initialization, so Hawk can match errors with the source maps of the release. The value is inlined at build time, so it works in the browser without the `NEXT_PUBLIC_` prefix.

```ts
// instrumentation-client.ts
import HawkCatcher from '@hawk.so/javascript';

new HawkCatcher({
  token: process.env.NEXT_PUBLIC_HAWK_TOKEN,
  release: process.env.HAWK_RELEASE,
});
```

#### TypeScript

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

See the [example](./example) app for a complete setup.
