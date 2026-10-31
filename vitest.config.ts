import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    server: {
      deps: {
        /**
         * The browser catcher keeps module-level singletons, so it is reloaded with the tested module
         */
        inline: [/@hawk\.so\//],
      },
    },
  },
});
