# Hawk Next.js example

Next.js app that sends releases with source maps to Hawk using `@hawk.so/nextjs` and catches errors with `@hawk.so/javascript` and `@hawk.so/nodejs`.

- [next.config.ts](./next.config.ts) connects the plugin
- [instrumentation-client.ts](./instrumentation-client.ts) initializes the JavaScript Catcher with the release id
- [instrumentation.ts](./instrumentation.ts) initializes the Node.js Catcher and sends server request errors
- [app/error.tsx](./app/error.tsx) reports errors caught by the error boundary
- [app/error-button.tsx](./app/error-button.tsx) throws an error to check the stack trace in Hawk
- [app/server-error/page.tsx](./app/server-error/page.tsx) throws an error on the server
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

Open http://localhost:3000, click the button and check the event in Hawk: the stack trace should point to `app/error-button.tsx`. The "Server error" link sends an event from the server.
