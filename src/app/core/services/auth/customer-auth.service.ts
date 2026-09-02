import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { uploadAvatar } from '../../../shared/utils/avatar-upload.util';

import { CUSTOMER_AUTH_PERSISTENCE, CUSTOMER_SUPABASE } from '../../tokens';
import {
  AuthenticatedUserProfile,
  CustomerProfileUpdate,
  LoginRequest,
  RegisterRequest,
} from '../../models/auth';

export type CustomerSignupResult =
  | { status: 'confirmation-required'; email: string }
  | { status: 'authenticated'; session: Session };

const CUSTOMER_SIGNUP_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  over_email_send_rate_limit:
    'Too many confirmation emails have been requested. Please wait a while before trying again.',
  email_address_invalid: 'Please enter a valid email address.',
  weak_password: 'Please choose a stronger password.',
  user_already_exists: 'This email is already registered. Please sign in instead.',
  email_exists: 'This email is already registered. Please sign in instead.',
  signup_disabled: 'Customer registration is currently unavailable. Please try again later.',
  validation_failed: 'Please check your registration details and try again.',
  unexpected_failure: 'Unable to create account. Please try again.',
};

const CUSTOMER_OAUTH_RETURN_URL_KEY = 'nestora-customer-oauth-return-url';
export const CUSTOMER_PASSWORD_MIN_LENGTH = 6;

export function getCustomerSignupErrorMessage(error: unknown): string {
  const code = getStringProperty(error, 'code');
  if (code && CUSTOMER_SIGNUP_ERROR_MESSAGES[code]) {
    return CUSTOMER_SIGNUP_ERROR_MESSAGES[code];
  }

  const message = getStringProperty(error, 'message')?.toLowerCase() ?? '';
  if (message.includes('email rate limit')) return CUSTOMER_SIGNUP_ERROR_MESSAGES['over_email_send_rate_limit'];
  if (message.includes('already registered') || message.includes('already exists')) {
    return CUSTOMER_SIGNUP_ERROR_MESSAGES['user_already_exists'];
  }
  if (message.includes('invalid email')) return CUSTOMER_SIGNUP_ERROR_MESSAGES['email_address_invalid'];
  if (message.includes('weak password') || message.includes('password should be')) {
    return CUSTOMER_SIGNUP_ERROR_MESSAGES['weak_password'];
  }
  if (message.includes('database') || message.includes('profile') || message.includes('trigger')) {
    return 'Your account could not be initialized. Please try again or contact support.';
  }

  return CUSTOMER_SIGNUP_ERROR_MESSAGES['unexpected_failure'];
}

function getStringProperty(value: unknown, property: string): string | null {
  if (typeof value !== 'object' || value === null || !(property in value)) return null;
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === 'string' ? propertyValue : null;
}

@Injectable({ providedIn: 'root' })
export class CustomerAuthService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly persistence = inject(CUSTOMER_AUTH_PERSISTENCE);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly destroyRef = inject(DestroyRef);
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.user() && this.currentCustomerProfile()?.roles?.name === 'customer');
  readonly isLoading = signal(true);
  readonly currentCustomerProfile = signal<AuthenticatedUserProfile | null>(null);
  readonly customerProfile = this.currentCustomerProfile;
  private readonly passwordRecoverySession = signal<Session | null>(null);
  readonly displayName = computed<string>(() => {
    const metadataName = this.user()?.user_metadata['full_name'];
    return this.currentCustomerProfile()?.full_name?.trim()
      || (typeof metadataName === 'string' ? metadataName : '')
      || this.user()?.email
      || 'Customer';
  });
  readonly initials = computed(() => this.displayName().split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join('') || 'C');

  private initialized: Promise<void> | null = null;
  private lastLoadedProfileUserId: string | null | undefined;
  private activeProfileLoad: { userId: string | null; promise: Promise<void> } | null = null;
  private profileLoadSequence = 0;
  private readonly passwordRecoveryWaiters = new Set<(session: Session) => void>();

  constructor() {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      this.handlePasswordRecoveryEvent(event, session);
      if (this.currentCustomerProfile()?.id !== session?.user.id) {
        this.currentCustomerProfile.set(null);
      }
      void this.synchronizeProfileForSession(session).catch(() => {
        // Consumers that require authentication surface initialization failures.
      });
    });
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
    void this.initialize();
  }

  initialize(): Promise<void> {
    this.initialized ??= this.restoreSession();
    return this.initialized;
  }

  async login(
    request: LoginRequest,
    returnUrl?: string | null,
    rememberSession = true,
  ): Promise<void> {
    this.persistence.setRememberSession(rememberSession);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: request.email,
      password: request.password,
    });

    if (error) throw new Error(error.message);
    this.session.set(data.session);

    const userId = data.user?.id;
    if (!userId) throw new Error('User not found.');

    await this.synchronizeProfileForSession(data.session);
    const profile = this.currentCustomerProfile();
    if (!profile) {
      await this.logout(false);
      throw new Error('Customer profile not found.');
    }

    if (!profile.is_active) {
      await this.logout(false);
      throw new Error('Your account is inactive.');
    }

    this.currentCustomerProfile.set(profile);

    await this.navigateToCustomerReturnUrl(returnUrl);
  }

  async continueWithGoogle(
    returnUrl?: string | null,
    rememberSession = true,
  ): Promise<void> {
    const origin = this.document.defaultView?.location.origin;
    if (!origin) throw new Error('Google sign-in is unavailable in this environment.');

    this.persistence.setRememberSession(rememberSession);
    this.storeOAuthReturnUrl(returnUrl);

    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/customer-callback`,
      },
    });

    if (error) {
      this.clearOAuthReturnUrl();
      throw new Error(error.message);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const origin = this.document.defaultView?.location.origin;
    if (!origin) throw new Error('Password reset is unavailable in this environment.');

    const { error } = await this.supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${origin}/auth/customer-reset-password` },
    );

    if (error) throw new Error(error.message);
  }

  async waitForPasswordRecoverySession(timeoutMs = 5000): Promise<Session | null> {
    if (this.passwordRecoverySession()) return this.passwordRecoverySession();

    await this.initialize();
    if (this.passwordRecoverySession()) return this.passwordRecoverySession();

    const view = this.document.defaultView;
    if (!view) return null;

    return new Promise<Session | null>((resolve) => {
      const waiter = (session: Session): void => {
        view.clearTimeout(timeoutId);
        this.passwordRecoveryWaiters.delete(waiter);
        resolve(session);
      };
      const timeoutId = view.setTimeout(() => {
        this.passwordRecoveryWaiters.delete(waiter);
        resolve(null);
      }, timeoutMs);

      this.passwordRecoveryWaiters.add(waiter);
    });
  }

  async updatePasswordFromRecovery(password: string): Promise<void> {
    const recoverySession = this.passwordRecoverySession();
    if (!recoverySession) throw new Error('The password reset link is invalid or has expired.');

    const { data: userData, error: userError } = await this.supabase.auth.getUser();
    if (userError || userData.user?.id !== recoverySession.user.id) {
      this.passwordRecoverySession.set(null);
      throw new Error('The password reset link is invalid or has expired.');
    }

    const { error: updateError } = await this.supabase.auth.updateUser({ password });
    if (updateError) throw new Error(updateError.message);

    this.passwordRecoverySession.set(null);
    await this.logout(false);
  }

  async completeGoogleSignIn(oauthError?: string | null): Promise<string> {
    if (oauthError) {
      this.clearOAuthReturnUrl();
      throw new Error(oauthError);
    }

    await this.initialize();
    const session = this.session();
    if (!session?.user.id) throw new Error('Google sign-in did not return a session.');

    await this.synchronizeProfileForSession(session, true);
    const profile = this.currentCustomerProfile();
    if (!profile) {
      await this.logout(false);
      throw new Error('Your customer profile could not be initialized.');
    }
    if (!profile.is_active) {
      await this.logout(false);
      throw new Error('Your account is inactive.');
    }

    const returnUrl = this.readOAuthReturnUrl();
    this.clearOAuthReturnUrl();
    return this.isSafeCustomerReturnUrl(returnUrl) ? returnUrl : '/shop';
  }

  // async register(request: RegisterRequest): Promise<CustomerSignupResult> {
  //   const { data, error } = await this.supabase.auth.signUp({
  //     email: request.email,
  //     password: request.password,
  //     options: {
  //       data: {
  //         full_name: request.fullName,
  //         phone: request.phone,
  //         role: 'customer',
  //       },
  //     },
  //   });

  //   if (error) throw error;

  //   if (!data.user?.id) throw new Error('Supabase did not return a user after signup.');

  //   if (!data.session) {
  //     return { status: 'confirmation-required', email: request.email };
  //   }

  //   this.session.set(data.session);
  //   await this.restoreProfile(data.session);
  //   return { status: 'authenticated', session: data.session };
  // }

  async register(request: RegisterRequest): Promise<CustomerSignupResult> {
  this.persistence.setRememberSession(true);
  const email = request.email.trim().toLowerCase();
  const fullName = request.fullName.trim();
  const phone = request.phone.trim();

  const { data, error } = await this.supabase.auth.signUp({
    email,
    password: request.password,
    options: {
      data: {
        full_name: fullName,
        phone,
        role: 'customer',
      },
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user?.id) {
    throw new Error('Supabase did not return a user after signup.');
  }

  if (!data.session) {
    return {
      status: 'confirmation-required',
      email,
    };
  }

  this.session.set(data.session);
  await this.synchronizeProfileForSession(data.session);

  const profile = this.currentCustomerProfile();

  if (!profile) {
    await this.logout(false);
    throw new Error('Your customer profile could not be initialized.');
  }

  return {
    status: 'authenticated',
    session: data.session,
  };
}

  async logout(navigate = true): Promise<void> {
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Unable to sign out. Please try again.');

    this.currentCustomerProfile.set(null);
    this.session.set(null);
    this.lastLoadedProfileUserId = null;
    this.profileLoadSequence += 1;
    this.activeProfileLoad = null;
    if (navigate) await this.router.navigate(['/shop'], { replaceUrl: true });
  }

  async getCurrentCustomerProfile(): Promise<AuthenticatedUserProfile | null> {
    await this.initialize();
    await this.synchronizeProfileForSession(this.session());
    return this.currentCustomerProfile();
  }

  async refreshCurrentCustomerProfile(): Promise<AuthenticatedUserProfile | null> {
    await this.initialize();
    await this.synchronizeProfileForSession(this.session(), true);
    return this.currentCustomerProfile();
  }

  async getCurrentUserId(): Promise<string | null> {
    await this.initialize();
    return this.isAuthenticated() ? this.user()?.id ?? null : null;
  }

  async updateProfile(updates: CustomerProfileUpdate): Promise<AuthenticatedUserProfile> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to update your profile.');
    const { data, error } = await this.supabase.from('profiles').update(updates).eq('id', userId).select(this.profileSelect).single();
    if (error) throw new Error(error.message);
    const profile = data as unknown as AuthenticatedUserProfile;
    if (profile.roles?.name !== 'customer') throw new Error('Customer profile not found.');
    this.currentCustomerProfile.set(profile);
    return profile;
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
    birthday,
    roles (
      id,
      name,
      description
    )
  `;

  private async restoreSession(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw new Error(error.message);
      this.session.set(data.session);
      if (this.currentCustomerProfile()?.id !== data.session?.user.id) {
        this.currentCustomerProfile.set(null);
      }
      await this.synchronizeProfileForSession(data.session);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async synchronizeProfileForSession(
    session: Session | null,
    force = false,
  ): Promise<void> {
    const userId = session?.user.id ?? null;

    if (this.activeProfileLoad?.userId === userId) {
      await this.activeProfileLoad.promise;
      return;
    }

    if (!force && this.lastLoadedProfileUserId === userId) return;

    const promise = this.loadProfileForSession(session);
    this.activeProfileLoad = { userId, promise };

    try {
      await promise;
    } finally {
      if (this.activeProfileLoad?.promise === promise) {
        this.activeProfileLoad = null;
      }
    }
  }

  private async loadProfileForSession(session: Session | null): Promise<void> {
    const sequence = ++this.profileLoadSequence;
    const userId = session?.user.id ?? null;

    if (!userId) {
      this.currentCustomerProfile.set(null);
      this.lastLoadedProfileUserId = null;
      return;
    }

    const profile = await this.getCustomerProfileById(userId);
    if (sequence !== this.profileLoadSequence || this.session()?.user.id !== userId) return;

    this.currentCustomerProfile.set(profile);
    this.lastLoadedProfileUserId = userId;
  }

  private async getCustomerProfileById(userId: string): Promise<AuthenticatedUserProfile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(this.profileSelect)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const profile = data as unknown as AuthenticatedUserProfile | null;
    return profile?.roles?.name === 'customer' ? profile : null;
  }

  private handlePasswordRecoveryEvent(event: AuthChangeEvent, session: Session | null): void {
    if (event === 'PASSWORD_RECOVERY' && session) {
      this.passwordRecoverySession.set(session);
      for (const waiter of this.passwordRecoveryWaiters) waiter(session);
      this.passwordRecoveryWaiters.clear();
      return;
    }

    if (event === 'SIGNED_OUT') this.passwordRecoverySession.set(null);
  }

  private async navigateToCustomerReturnUrl(returnUrl?: string | null): Promise<void> {
    if (this.isSafeCustomerReturnUrl(returnUrl)) {
      await this.router.navigateByUrl(returnUrl);
    } else {
      await this.router.navigate(['/shop']);
    }
  }

  private isSafeCustomerReturnUrl(returnUrl?: string | null): returnUrl is string {
    return !!returnUrl && returnUrl.startsWith('/shop') && !returnUrl.startsWith('//');
  }

  private storeOAuthReturnUrl(returnUrl?: string | null): void {
    const storage = this.sessionStorage();
    if (!storage) return;
    storage.setItem(
      CUSTOMER_OAUTH_RETURN_URL_KEY,
      this.isSafeCustomerReturnUrl(returnUrl) ? returnUrl : '/shop',
    );
  }

  private readOAuthReturnUrl(): string | null {
    return this.sessionStorage()?.getItem(CUSTOMER_OAUTH_RETURN_URL_KEY) ?? null;
  }

  private clearOAuthReturnUrl(): void {
    this.sessionStorage()?.removeItem(CUSTOMER_OAUTH_RETURN_URL_KEY);
  }

  private sessionStorage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  async uploadCurrentUserAvatar(file: File): Promise<string> {
  const userId = this.user()?.id;

  if (!userId) {
    throw new Error('You must be logged in to upload a profile image.');
  }

  return uploadAvatar(this.supabase, userId, file);
}
}
