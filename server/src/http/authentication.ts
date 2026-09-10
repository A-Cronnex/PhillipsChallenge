/** Authentication port. The default rejects requests without configured device credentials. */
import type { Principal } from '../validation/validate-change';

export type AuthenticationResult =
  | { authenticated: true; principal: Principal }
  | { authenticated: false; reason: string };

export interface Authenticator {
  /**
   * Resolves the caller from request headers.
   *
   * Must never fall back to a principal supplied in the request *body*: the
   * body is the untrusted payload, and taking identity from it would let a
   * caller write records as any user (CLAUDE.md §15).
   */
  authenticate(headers: Readonly<Record<string, string>>): Promise<AuthenticationResult>;
}

/** The default. Refuses every request until a real protocol is chosen. */
export function createRejectingAuthenticator(): Authenticator {
  return {
    async authenticate() {
      return {
        authenticated: false,
        reason:
          'No device credentials are configured. Configure SYNC_DEVICE_CREDENTIALS ' +
          'before using the sync endpoint.',
      };
    },
  };
}
