import { describe, expect, it } from 'vitest';
import { getDigest, isNextControlFlowError, isNextControlFlowTitle } from '../src/common/control-flow';

/**
 * Creates an error with the digest Next.js adds to its errors
 * @param digest - error digest
 */
function withDigest(digest: string): Error & { digest: string } {
  return Object.assign(new Error(digest), { digest });
}

describe('isNextControlFlowError', () => {
  it.each([
    'NEXT_REDIRECT;replace;/login;307;',
    'NEXT_HTTP_ERROR_FALLBACK;404',
    'NEXT_HTTP_ERROR_FALLBACK;403',
    'NEXT_NOT_FOUND',
    'BAILOUT_TO_CLIENT_SIDE_RENDERING',
    'DYNAMIC_SERVER_USAGE',
    'NEXT_PRERENDER_INTERRUPTED',
    'HANGING_PROMISE_REJECTION',
  ])('detects the %s digest', (digest) => {
    expect(isNextControlFlowError(withDigest(digest))).toBe(true);
  });

  it('detects static generation bailouts and postponed renders', () => {
    expect(isNextControlFlowError(Object.assign(new Error('bailout'), { code: 'NEXT_STATIC_GEN_BAILOUT' }))).toBe(true);
    expect(isNextControlFlowError({ $$typeof: Symbol.for('react.postpone') })).toBe(true);
  });

  it('detects control flow errors by the message and in the cause chain', () => {
    expect(isNextControlFlowError(new Error('NEXT_REDIRECT'))).toBe(true);
    expect(isNextControlFlowError(new Error('wrapped', { cause: withDigest('NEXT_HTTP_ERROR_FALLBACK;404') }))).toBe(true);
  });

  it('skips regular errors and server errors forwarded to the client', () => {
    expect(isNextControlFlowError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isNextControlFlowError(withDigest('2338541376'))).toBe(false);
    expect(isNextControlFlowError('NEXT_REDIRECT')).toBe(false);
    expect(isNextControlFlowError(null)).toBe(false);
  });
});

describe('isNextControlFlowTitle', () => {
  it('detects control flow digests in event titles', () => {
    expect(isNextControlFlowTitle('NEXT_REDIRECT;push;/;307;')).toBe(true);
    expect(isNextControlFlowTitle('TypeError: x is undefined')).toBe(false);
  });
});

describe('getDigest', () => {
  it('returns the digest of the error', () => {
    expect(getDigest(withDigest('2338541376'))).toBe('2338541376');
    expect(getDigest(new Error('no digest'))).toBeUndefined();
    expect(getDigest(Object.assign(new Error('empty'), { digest: '' }))).toBeUndefined();
    expect(getDigest('string')).toBeUndefined();
  });
});
