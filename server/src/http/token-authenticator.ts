import { createHash, timingSafeEqual } from 'node:crypto';
import type { Authenticator } from './authentication';
import { isUuid } from '../validation/validate-change';

/** Administrator-provisioned credentials scoped to one user and one installation. */
export function createTokenAuthenticator(config: string): Authenticator {
  const entries: unknown = JSON.parse(config);
  if (!Array.isArray(entries) || entries.length === 0 || entries.some(entry => !entry ||
    !isUuid(entry.userId) || !isUuid(entry.deviceId) || typeof entry.tokenSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.tokenSha256))) {
    throw new Error('SYNC_DEVICE_CREDENTIALS must contain userId, deviceId and a SHA-256 token digest.');
  }
  const credentials = entries.map(entry => ({ userId: entry.userId as string, deviceId: entry.deviceId as string,
    digest: Buffer.from(entry.tokenSha256, 'hex') }));
  return {
    async authenticate(headers) {
      const value = headers.authorization ?? '';
      if (value.startsWith('Bearer ') && value.length <= 1024) {
        const digest = createHash('sha256').update(value.slice(7)).digest();
        const credential = credentials.find(entry => timingSafeEqual(entry.digest, digest));
        if (credential && headers['x-device-id'] === credential.deviceId) {
          return { authenticated: true, principal: { userId: credential.userId, deviceId: credential.deviceId } };
        }
      }
      return { authenticated: false, reason: 'Invalid device credential.' };
    },
  };
}
