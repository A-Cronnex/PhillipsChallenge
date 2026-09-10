import { createHash } from 'node:crypto';
import { createTokenAuthenticator } from '../../server/src/http/token-authenticator';
const userId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const token = 'test-only-device-credential';
const make = () => createTokenAuthenticator(JSON.stringify([{ userId, deviceId,
  tokenSha256: createHash('sha256').update(token).digest('hex') }]));
test('valid credential binds identity from provisioning', async () => {
  const result = await make().authenticate({ authorization: `Bearer ${token}`, 'x-device-id': deviceId, 'x-user-id': 'attacker' });
  expect(result).toEqual({ authenticated: true, principal: { userId, deviceId } });
});
test.each(['', 'Bearer wrong', 'Basic abc'])('rejects missing or invalid credential: %s', async authorization => {
  expect((await make().authenticate({ authorization, 'x-device-id': deviceId })).authenticated).toBe(false);
});
test('rejects a credential used from another installation', async () => {
  expect((await make().authenticate({ authorization: `Bearer ${token}`, 'x-device-id': userId })).authenticated).toBe(false);
});
test('fails closed on invalid provisioning', () => {
  expect(() => createTokenAuthenticator('[]')).toThrow();
  expect(() => createTokenAuthenticator('[{"tokenSha256":"x"}]')).toThrow();
});
