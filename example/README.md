# Hawk Next.js example

Next.js app that catches errors and sends releases with source maps to Hawk using `@hawk.so/nextjs`.

- [next.config.ts](./next.config.ts) connects the plugin that sends the release
- [instrumentation-client.ts](./instrumentation-client.ts) catches errors in the browser
- [instrumentation.ts](./instrumentation.ts) catches errors on the server and sends request errors
- [app/error.tsx](./app/error.tsx) sends errors shown by the error page
- [app/global-error.tsx](./app/global-error.tsx) is the ready global error page
- [app/error-button.tsx](./app/error-button.tsx) throws an error to check the stack trace in Hawk
- [app/boundary/page.tsx](./app/boundary/page.tsx) catches a render error with `HawkErrorBoundary`
- [app/server-error/page.tsx](./app/server-error/page.tsx) throws an error in a server component
- [app/action-error](./app/action-error) throws an error in a server action
- [app/edge-error/route.ts](./app/edge-error/route.ts) throws an error in an Edge route handler
- [app/edge-send/route.ts](./app/edge-send/route.ts) sends an error manually from the Edge runtime
- [app/redirect/page.tsx](./app/redirect/page.tsx) and [app/not-found-page/page.tsx](./app/not-found-page/page.tsx) use `redirect()` and `notFound()`, which are not sent
- [app/posts/[slug]/page.tsx](./app/posts/%5Bslug%5D/page.tsx) is a dynamic route: its chunk URL is encoded, e.g. `%5Bslug%5D`

## Run

Copy `.env.sample` to `.env` and put your project's Integration Token there. Then run from the repository root:

```shell
yarn
yarn build
cd example
yarn build
yarn start
```

Open http://localhost:3000, click the button and check the event in Hawk: the stack trace should point to `app/error-button.tsx`. The other links send events from the error boundary, the server and the Edge runtime.
