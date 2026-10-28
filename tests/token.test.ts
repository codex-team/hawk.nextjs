import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { getDefaultCollectorEndpoint, getIntegrationId } from '../src/token';
import { createToken } from './helpers';

describe('getIntegrationId', () => {
  it('returns integration id from a valid token', () => {
    expect(getIntegrationId(createToken('abc-123'))).toBe('abc-123');
  });

  it('returns undefined for a token that is not base64 JSON', () => {
    expect(getIntegrationId('not-a-token')).toBeUndefined();
  });

  it('returns undefined when integration id is missing or empty', () => {
    const encode = (payload: unknown): string => Buffer.from(JSON.stringify(payload)).toString('base64');

    expect(getIntegrationId(encode({ secret: 'secret' }))).toBeUndefined();
    expect(getIntegrationId(encode({ integrationId: '' }))).toBeUndefined();
    expect(getIntegrationId(encode(null))).toBeUndefined();
  });
});

describe('getDefaultCollectorEndpoint', () => {
  it('builds the k1 collector URL', () => {
    expect(getDefaultCollectorEndpoint('abc-123')).toBe('https://abc-123.k1.hawk.so/release');
  });
});
