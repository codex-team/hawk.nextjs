import type { BeforeSendHook, HawkStorage, MessageProcessor, ProcessingPayload, RandomGenerator } from '@hawk.so/core';
import type { StackParser } from '@hawk.so/core';
import { BaseCatcher, decodeIntegrationId, HawkUserManager } from '@hawk.so/core';
import type { AffectedUser, EventContext } from '@hawk.so/types';
import type { NextjsAddons } from '../common/request';
import { settleWithTimeout } from '../common/timeout';
import { VERSION } from '../common/version';
import { ServerStackParser } from './stack-parser';
import { FetchTransport } from './transport';

/**
 * Events of Next.js server runtimes are processed like Node.js ones
 */
type ServerCatcherType = 'errors/nodejs';

/**
 * Options the server catcher is created with
 */
export interface ServerCatcherSettings {
  /**
   * Hawk Integration Token
   */
  token: string;

  /**
   * Release id
   */
  release?: string;

  /**
   * Data sent with every event
   */
  context?: EventContext;

  /**
   * Filters or modifies events before sending
   */
  beforeSend?: BeforeSendHook<ServerCatcherType>;

  /**
   * Collector endpoint overwrite
   */
  collectorEndpoint?: string;

  /**
   * Current runtime: `nodejs` or `edge`
   */
  runtime: string;
}

/**
 * Options of a single event
 */
export interface CaptureOptions {
  /**
   * Data sent with the event
   */
  context?: EventContext;

  /**
   * User affected by the error
   */
  user?: AffectedUser;

  /**
   * Next.js data of the event
   */
  addons?: NextjsAddons;
}

/**
 * Private field of the core catcher with the stack trace parser
 */
interface CatcherWithStackParser {
  /**
   * Parser that builds the backtrace of the event
   */
  stackParser: StackParser;
}

/**
 * Users passed with errors. The core catcher has no per-event user, so it is set by a message processor
 */
const usersByError = new WeakMap<object, AffectedUser>();

/**
 * Storage that keeps nothing: the anonymous user id is removed from server events anyway
 */
const noopStorage: HawkStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * Generator of the anonymous user id, which is removed from server events anyway
 */
const zeroRandomGenerator: RandomGenerator = {
  getRandomNumbers: length => new Uint8Array(length),
};

/**
 * The server serves many users at once, so it has no current user.
 * The core catcher requires one and creates an anonymous id, which would be shared by all requests of the process
 */
class ServerUserManager extends HawkUserManager {
  /**
   * Creates a manager that never stores the user
   */
  constructor() {
    super(noopStorage, zeroRandomGenerator);
  }
}

/**
 * Sets the user passed with the error, or removes the user created by the core catcher
 */
class ServerUserProcessor implements MessageProcessor<ServerCatcherType> {
  /**
   * @param payload - event being built
   * @param error - sent error
   */
  public apply(payload: ProcessingPayload<ServerCatcherType>, error?: Error | string): ProcessingPayload<ServerCatcherType> {
    const user = typeof error === 'object' ? usersByError.get(error) : undefined;

    if (user !== undefined) {
      payload.user = user;
    } else {
      delete payload.user;
    }

    return payload;
  }
}

/**
 * Returns default collector endpoint for events
 * @param token - Hawk Integration Token
 */
function getDefaultEndpoint(token: string): string {
  return `https://${decodeIntegrationId(token)}.k1.hawk.so/`;
}

/**
 * Hawk catcher for Next.js server runtimes: Node.js and Edge
 */
export class ServerCatcher extends BaseCatcher<ServerCatcherType> {
  /**
   * Transport kept to wait for the events in progress
   */
  private readonly fetchTransport: FetchTransport;

  /**
   * Current runtime: `nodejs` or `edge`
   */
  private readonly runtime: string;

  /**
   * Events being built: the stack trace is parsed asynchronously before the event gets to the transport
   */
  private readonly pending = new Set<Promise<void>>();

  /**
   * @param settings - token, release and other settings
   * @throws when the token is invalid and the collector endpoint is not set
   */
  constructor(settings: ServerCatcherSettings) {
    const transport = new FetchTransport(settings.collectorEndpoint ?? getDefaultEndpoint(settings.token));

    super(settings.token, transport, new ServerUserManager(), settings.release, settings.context, settings.beforeSend);

    this.fetchTransport = transport;
    this.runtime = settings.runtime;
    this.addMessageProcessor(new ServerUserProcessor());

    /**
     * The core catcher has no option to replace the parser, so its field is overwritten
     */
    (this as unknown as CatcherWithStackParser).stackParser = new ServerStackParser();
  }

  /**
   * Sends the error and resolves when it is passed to the transport
   * @param error - error or message
   * @param options - context, user and Next.js data of the event
   */
  public capture(error: Error | string, options: CaptureOptions = {}): Promise<void> {
    if (options.user !== undefined && typeof error === 'object') {
      usersByError.set(error, options.user);
    }

    const addons: NextjsAddons = {
      runtime: this.runtime,
      ...options.addons,
    };

    const building = this.formatAndSend(error, { nextjs: addons }, options.context).finally(() => {
      this.pending.delete(building);
    });

    this.pending.add(building);

    return building;
  }

  /**
   * Waits for the events being built and sent
   * @param timeout - max time to wait, in milliseconds
   * @returns false when the timeout is reached
   */
  public async flush(timeout: number): Promise<boolean> {
    const deadline = Date.now() + timeout;

    if (!await settleWithTimeout(this.pending, timeout)) {
      return false;
    }

    return this.fetchTransport.flush(Math.max(deadline - Date.now(), 0));
  }

  /**
   * Returns the catcher type
   */
  protected getCatcherType(): ServerCatcherType {
    return 'errors/nodejs';
  }

  /**
   * Returns the catcher version
   */
  protected getCatcherVersion(): string {
    return VERSION;
  }
}
