# Hawk Next.js example

Next.js app that sends releases with source maps to Hawk using `@hawk.so/nextjs`.

- [next.config.ts](./next.config.ts) connects the plugin
- [instrumentation-client.ts](./instrumentation-client.ts) initializes the JavaScript Catcher with the release id
- [app/error-button.tsx](./app/error-button.tsx) throws an error to check the stack trace in Hawk
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

Open http://localhost:3000, click the button and check the event in Hawk: the stack trace should point to `app/error-button.tsx`.
