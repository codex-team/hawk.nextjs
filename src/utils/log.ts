/**
 * Terminal output colors
 */
export const consoleColors = {
  fgRed: 31,
  fgGreen: 32,
  fgYellow: 33,
  fgCyan: 36,
} as const;

/**
 * One of the terminal output colors
 */
export type ConsoleColor = typeof consoleColors[keyof typeof consoleColors];

/**
 * Set a terminal color to the message
 * @param message - text to wrap
 * @param color - color code
 */
export function wrapInColor(message: string, color: ConsoleColor): string {
  return `\x1b[${color}m${message}\x1b[0m`;
}

/**
 * Decorates terminal log with the Hawk prefix
 * @param message - message to print
 * @param color - message color
 */
export function log(message: string, color: ConsoleColor = consoleColors.fgCyan): void {
  console.log(wrapInColor('🦅 Hawk | ' + message, color));
}

/**
 * Returns a printable message of the caught error
 * @param error - caught error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
