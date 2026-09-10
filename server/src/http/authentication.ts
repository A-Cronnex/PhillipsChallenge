/**
 * The authentication seam.
 *
 * The authentication protocol is explicitly unresolved (CLAUDE.md §18,
 * docs/tech-stack.md §9), so this file defines the shape of the decision
 * without making it. `/v1/sync` cannot be served without an `Authenticator`,
 * and the default one rejects everything — an endpoint that accepts hospital
 * data from anyone who can reach the port is not a safe default to ship while
 * the decision is pending.
 *
 * Whatever protocol is chosen (bearer tokens, mTLS, OIDC) becomes an
 * implementation of `Authenticator`; nothing else on the server changes.
 */
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
          'No authentication protocol is configured. The protocol is an open ' +
          'decision (CLAUDE.md §18); the sync endpoint refuses all requests ' +
          'until an Authenticator is supplied.',
      };
    },
  };
}
