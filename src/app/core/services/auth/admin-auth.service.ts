import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ADMIN_AUTH_PERSISTENCE, ADMIN_SUPABASE } from '../../tokens';
import {
  AppRoleName,
  AuthenticatedUserProfile,
  CurrentUserProfileUpdate,
  LoginRequest,
  UserProfile,
} from '../../models/auth';

import { AuthSessionLifecycle, LogoutResult } from './auth-session-lifecycle';
import { adminProfilePayload } from './profile-update.util';

const AVATAR_STORAGE_BUCKET = 'avatars';
const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024;
const MISSING_AVATAR_BUCKET_MESSAGE =
  'Avatar storage bucket is missing. Please create a Supabase Storage bucket named avatars.';
const ADMIN_ROLES: AppRoleName[] = ['admin', 'super_admin'];

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly supabase = inject(ADMIN_SUPABASE);
  private readonly persistence = inject(ADMIN_AUTH_PERSISTENCE);
  private readonly router = inject(Router);

  private readonly lifecycle = new AuthSessionLifecycle(this.supabase, this.persistence);

  readonly currentUserProfile = signal<AuthenticatedUserProfile | null>(null);
  private profileRequest: {
    userId: string;
    promise: Promise<AuthenticatedUserProfile | null>;
  } | null = null;

  constructor() {
    const { data } = this.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && this.supabase.auth.serverManaged && !this.lifecycle.acceptsSession) {
        this.lifecycle.prepareSession();
        void this.getCurrentUserProfile().catch(() => this.clearState());
        return;
      }
      if (event !== 'SIGNED_OUT' || !this.lifecycle.acceptsSession) return;
      const hadProfile = this.currentUserProfile() !== null;
      this.lifecycle.invalidate();
      this.clearState();
      if (hadProfile && /^\/(?:admin|super-admin)(?:\/|$)/.test(this.router.url)) {
        void this.router.navigate(['/auth/login'], { replaceUrl: true }).catch(() => undefined);
      }
    });
    inject(DestroyRef).onDestroy(() => data.subscription.unsubscribe());
  }

  async login(
    request: LoginRequest,
    returnUrl?: string | null,
    rememberSession = true,
  ): Promise<void> {
    const profile = await this.lifecycle.authenticate(rememberSession, async (assertCurrent) => {
      this.clearState();
      const { data, error } = await this.supabase.auth.signInWithPassword(request);
      assertCurrent();
      if (error) throw new Error(error.message);
      if (!data.user?.id) throw new Error('User not found.');
      const profile = this.supabase.auth.serverManaged
        ? data.profile?.id === data.user.id ? data.profile : null
        : await this.getAuthenticatedProfile(data.user.id);
      assertCurrent();
      if (!profile) throw new Error('Profile not found.');
      if (profile.is_active !== true) throw new Error('Your account is inactive.');
      if (!isAdminRole(profile.roles?.name)) {
        throw new Error('This account does not have admin access.');
      }
      this.currentUserProfile.set(profile);
      return profile;
    }, () => this.clearState());

    if (returnUrl && !returnUrl.startsWith('/shop') && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      await this.router.navigateByUrl(returnUrl);
      return;
    }

    await this.redirectByRole(profile.roles?.name ?? null);
  }

  async logout(): Promise<LogoutResult> {
    const result = await this.lifecycle.logout(() => this.clearState());
    await this.router.navigate(['/auth/login'], { replaceUrl: true });
    return result;
  }

  private clearState(): void {
    this.currentUserProfile.set(null);
    this.profileRequest = null;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as UserProfile | null;
  }

  async getCurrentUserProfile(): Promise<AuthenticatedUserProfile | null> {
    const version = this.lifecycle.version;
    if (!this.lifecycle.acceptsSession) return null;
    const profile = await this.readValidatedProfile().catch((error: unknown) => {
      if (this.lifecycle.isCurrent(version)) this.currentUserProfile.set(null);
      throw error;
    });
    if (!this.lifecycle.isCurrent(version)) return null;
    if (profile?.is_active !== true || !isAdminRole(profile.roles?.name)) {
      this.currentUserProfile.set(null);
      return null;
    }

    this.currentUserProfile.set(profile);
    return profile;
  }

  async updateCurrentUserProfile(
    updates: CurrentUserProfileUpdate,
  ): Promise<AuthenticatedUserProfile> {
    const payload = adminProfilePayload(updates);
    const version = this.lifecycle.version;
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to update your profile.');

    const { data, error } = await this.supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select(this.profileSelect)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Profile not found.');

    const profile = data as unknown as AuthenticatedUserProfile;
    if (!this.lifecycle.isCurrent(version) || profile.is_active !== true || !isAdminRole(profile.roles?.name)) {
      throw new Error('This account does not have admin access.');
    }

    this.currentUserProfile.set(profile);
    return profile;
  }

  async uploadCurrentUserAvatar(file: File): Promise<string> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to upload an avatar.');
    if (!file.type.startsWith('image/')) throw new Error('Please select a valid image file.');
    if (file.size > MAX_AVATAR_SIZE_BYTES) throw new Error('Avatar image must be 10 MB or smaller.');

    const safeFileName = sanitizeFileName(file.name);
    const filePath = `${userId}/${Date.now()}-${safeFileName}`;
    const { error } = await this.supabase.storage.from(AVATAR_STORAGE_BUCKET).upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (error) throw new Error(formatAvatarUploadError(error.message));

    const { data } = this.supabase.storage.from(AVATAR_STORAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  }

  async isAuthenticated(): Promise<boolean> {
    return !!(await this.getCurrentUserProfile());
  }

  async getCurrentUserId(): Promise<string | null> {
    return (await this.getCurrentUserProfile())?.id ?? null;
  }

  private async readValidatedProfile(): Promise<AuthenticatedUserProfile | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const userId = data.session?.user.id;
    if (!userId) return null;
    if (this.supabase.auth.serverManaged) return data.profile?.id === userId ? data.profile : null;
    return this.getAuthenticatedProfile(userId);
  }

  private readonly profileSelect = `
    id,
    role_id,
    full_name,
    email,
    phone,
    avatar_media_id,
    avatar_url,
    is_active,
    created_at,
    roles (
      id,
      name,
      description
    )
  `;

  private async getAuthenticatedProfile(userId: string): Promise<AuthenticatedUserProfile | null> {
    if (this.profileRequest?.userId === userId) return this.profileRequest.promise;
    const promise = this.loadAuthenticatedProfile(userId);
    this.profileRequest = { userId, promise };
    try {
      return await promise;
    } finally {
      if (this.profileRequest?.promise === promise) this.profileRequest = null;
    }
  }

  private async loadAuthenticatedProfile(userId: string): Promise<AuthenticatedUserProfile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(this.profileSelect)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as unknown as AuthenticatedUserProfile | null;
  }

  private async redirectByRole(roleName: AppRoleName | null): Promise<void> {
    switch (roleName) {
      case 'super_admin':
        await this.router.navigate(['/super-admin']);
        break;
      case 'admin':
        await this.router.navigate(['/admin'], { replaceUrl: true });
        break;
      default:
        await this.router.navigate(['/auth/login'], { replaceUrl: true });
        break;
    }
  }
}

function isAdminRole(roleName: AppRoleName | undefined | null): boolean {
  return !!roleName && ADMIN_ROLES.includes(roleName);
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');

  return sanitized || 'avatar';
}

function formatAvatarUploadError(message: string): string {
  if (message.toLowerCase().includes('bucket not found')) return MISSING_AVATAR_BUCKET_MESSAGE;
  return `Avatar upload failed. ${message}`;
}
