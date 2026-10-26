declare global {
  namespace NodeJS {
    /**
     * Environment variables inlined by Next.js
     */
    interface ProcessEnv {
      /**
       * Hawk release identifier, injected at build time by withHawkConfig
       */
      // eslint-disable-next-line @typescript-eslint/naming-convention
      HAWK_RELEASE: string;
    }
  }
}

export {};
