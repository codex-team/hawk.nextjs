import { Buffer } from 'node:buffer';

/**
 * Payload of the Hawk Integration Token
 */
interface IntegrationTokenPayload {
  /**
   * Id of the project integration, used as a collector subdomain
   */
  integrationId?: unknown;
}

/**
 * Returns integration id from the Hawk Integration Token
 * @param token - Hawk Integration Token (base64 encoded JSON)
 * @returns integration id or undefined when the token is malformed
 */
export function getIntegrationId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8')) as IntegrationTokenPayload;

    if (typeof payload.integrationId === 'string' && payload.integrationId !== '') {
      return payload.integrationId;
    }
  } catch (_error) {
    /* Malformed token, handled below */
  }

  return undefined;
}

/**
 * Returns default Hawk collector endpoint for releases
 * @param integrationId - id of the project integration
 */
export function getDefaultCollectorEndpoint(integrationId: string): string {
  return `https://${integrationId}.k1.hawk.so/release`;
}
