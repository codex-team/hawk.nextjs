import { StackParser } from '@hawk.so/core';
import type { BacktraceFrame } from '@hawk.so/types';
import ErrorStackParser from 'error-stack-parser';

/**
 * Parses stack traces without code snippets. The core parser downloads the source of every frame with `fetch`,
 * which fails on the server for `file://` frames of `next dev` and prints a warning for every event.
 * Server chunks are minified in production, so snippets of them would not help anyway
 */
export class ServerStackParser extends StackParser {
  /**
   * Returns frames of the stack trace
   * @param error - error with the stack trace
   */
  public override parse(error: Error): Promise<BacktraceFrame[]> {
    const frames = ErrorStackParser.parse(error).map(frame => ({
      file: frame.fileName ?? '',
      line: frame.lineNumber ?? 0,
      column: frame.columnNumber,
      function: frame.functionName,
      arguments: frame.args,
    }));

    return Promise.resolve(frames);
  }
}
