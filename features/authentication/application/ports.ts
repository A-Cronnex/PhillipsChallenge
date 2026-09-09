import type { UserRole } from '../../../types/domain';

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * Resolves who is capturing data on this device.
 *
 * Authentication is an unresolved decision (CLAUDE.md §18), so this port
 * deliberately exposes only what capture needs — an identity for
 * `observations.created_by`. It does not create users, sign anyone in, or
 * imply a session model. Whatever authentication is chosen later implements
 * this interface; nothing in the capture flow has to change.
 */
export interface UserRepository {
  getCurrentUser(): Promise<CurrentUser | null>;
}
