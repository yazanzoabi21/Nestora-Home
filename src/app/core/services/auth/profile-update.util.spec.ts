import { adminProfilePayload, customerProfilePayload } from './profile-update.util';

describe('runtime personal-profile payloads', () => {
  for (const field of ['role_id', 'is_active', 'id', 'created_at', 'roles', 'unknown_column']) {
    it(`rejects ${field} even when JavaScript bypasses TypeScript types`, () => {
      expect(() => adminProfilePayload({ full_name: 'Name', [field]: 'forbidden' })).toThrow('restricted');
      expect(() => customerProfilePayload({ full_name: 'Name', phone: null, birthday: null,
        [field]: 'forbidden' })).toThrow('restricted');
    });
  }
  it('preserves supported contact and avatar changes', () => {
    expect(adminProfilePayload({ email: 'contact@example.com', avatar_url: null })).toEqual({
      full_name: undefined, email: 'contact@example.com', phone: undefined,
      avatar_media_id: undefined, avatar_url: null,
    });
    expect(customerProfilePayload({ full_name: 'Name', phone: null, birthday: null }).full_name).toBe('Name');
  });
});
