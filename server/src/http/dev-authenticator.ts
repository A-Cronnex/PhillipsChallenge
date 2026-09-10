/**
 * DEVELOPMENT ONLY — NOT AN AUTHENTICATION PROTOCOL.
 *
 * Trusts two request headers and verifies nothing. It exists so the endpoint
 * can be exercised end-to-end on a laptop while the real protocol is still an
 * open decision (CLAUDE.md §18). Anyone who can reach the port can claim to be
 * any user.
 *
 * server/src/main.ts wires it only when SYNC_ALLOW_INSECURE_DEV_AUTH=true is
 * set explicitly, and never by default. Do not deploy with that variable set.
 */
import type { Authenticator } from './authentication';
import { isUuid } from '../validation/validate-change';

export function createInsecureDevAuthenticator(): Authenticator {
  return {
    async authenticate(headers) {
      const userId = headers['x-user-id'];
      const deviceId = headers['x-device-id'];
      if (!isUuid(userId) || !isUuid(deviceId)) {
        return {
          authenticated: false,
          reason: 'Dev authenticator requires x-user-id and x-device-id UUID headers.',
        };
      }
      return { authenticated: true, principal: { userId, deviceId } };
    },
  };
}
