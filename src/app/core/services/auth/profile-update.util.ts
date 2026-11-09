import type { CurrentUserProfileUpdate, CustomerProfileUpdate } from '../../models/auth';

function allowOnly(updates: object, allowed: readonly string[]): void {
  if (Object.keys(updates).some((key) => !allowed.includes(key))) {
    throw new Error('This profile update contains restricted fields.');
  }
}

export function adminProfilePayload(updates: CurrentUserProfileUpdate): CurrentUserProfileUpdate {
  allowOnly(updates, ['full_name', 'email', 'phone', 'avatar_media_id', 'avatar_url']);
  const { full_name, email, phone, avatar_media_id, avatar_url } = updates;
  return { full_name, email, phone, avatar_media_id, avatar_url };
}

export function customerProfilePayload(updates: CustomerProfileUpdate): CustomerProfileUpdate {
  allowOnly(updates, ['full_name', 'phone', 'birthday', 'avatar_media_id', 'avatar_url']);
  const { full_name, phone, birthday, avatar_media_id, avatar_url } = updates;
  return { full_name, phone, birthday, avatar_media_id, avatar_url };
}
