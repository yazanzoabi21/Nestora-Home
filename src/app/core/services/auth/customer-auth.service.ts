import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import type { BrowserSession, BrowserUser } from '../../models/auth/browser-auth.models';
import { uploadAvatar } from '../../../shared/utils/avatar-upload.util';

import { CUSTOMER_AUTH_PERSISTENCE, CUSTOMER_SUPABASE } from '../../tokens';
import {
  AuthenticatedUserProfile,
  CustomerProfileUpdate,
  LoginRequest,
  RegisterRequest,
} from '../../models/auth';

import { AuthSessionLifecycle, LogoutResult } from './auth-session-lifecycle';
import { customerProfilePayload } from './profile-update.util';

export type CustomerSignupResult =
  | { status: 'confirmation-required'; email: string }
  | { status: 'authenticated'; session: BrowserSession };

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

  private readonly lifecycle = new AuthSessionLifecycle(this.supabase, this.persistence);

  private readonly destroyRef = inject(DestroyRef);
  readonly session = signal<BrowserSession | null>(null);
  readonly user = computed<BrowserUser | null>(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() =>
    !!this.user() && this.currentCustomerProfile()?.is_active === true &&
    this.currentCustomerProfile()?.roles?.name === 'customer',
  );
  readonly isLoading = signal(true);
  readonly currentCustomerProfile = signal<AuthenticatedUserProfile | null>(null);
  readonly customerProfile = this.currentCustomerProfile;
  private readonly passwordRecoverySession = signal<BrowserSession | null>(null);
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
  private readonly passwordRecoveryWaiters = new Set<(session: BrowserSession | null) => void>();

  constructor() {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && this.supabase.auth.serverManaged && !this.lifecycle.acceptsSession) {
        this.lifecycle.prepareSession();
      }
      if (!this.lifecycle.acceptsSession) return;
      if (event === 'SIGNED_OUT') {
        this.lifecycle.invalidate();
        this.clearState();
        return;
      }
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
    void this.initialize().catch(() => {
      // Callers awaiting initialize() handle session restoration failures.
    });
  }

  initialize(): Promise<void> {
    this.initialized ??= this.restoreSession().catch((error: unknown) => {
      this.initialized = null; // A transient failure must be retryable.
      throw error;
    });
    return this.initialized;
  }

  async login(
    request: LoginRequest,
    returnUrl?: string | null,
    rememberSession = true,
  ): Promise<void> {
    await this.lifecycle.authenticate(rememberSession, async (assertCurrent) => {
      this.clearState();
      const { data, error } = await this.supabase.auth.signInWithPassword(request);
      assertCurrent();
      if (error) throw new Error(error.message);
      if (!data.user?.id || !data.session) throw new Error('User not found.');
      this.session.set(data.session);
      await this.synchronizeProfileForSession(data.session, !this.supabase.auth.serverManaged);
      assertCurrent();
      this.requireCustomerProfile();
    }, () => this.clearState());
    await this.navigateToCustomerReturnUrl(returnUrl);
  }

  async continueWithGoogle(
    returnUrl?: string | null,
    rememberSession = true,
  ): Promise<void> {
    const origin = this.document.defaultView?.location.origin;
    if (!origin) throw new Error('Google sign-in is unavailable in this environment.');

    await this.lifecycle.authenticate(rememberSession, async (assertCurrent) => {
      this.storeOAuthReturnUrl(returnUrl);
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/customer-callback` },
      });
      assertCurrent();
      if (error) throw new Error(error.message);
    }, () => this.clearState());
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

  async waitForPasswordRecoverySession(timeoutMs = 5000): Promise<BrowserSession | null> {
    if (this.passwordRecoverySession()) return this.passwordRecoverySession();

    await this.initialize().catch(() => undefined);
    if (this.passwordRecoverySession()) return this.passwordRecoverySession();

    const view = this.document.defaultView;
    if (!view) return null;

    return new Promise<BrowserSession | null>((resolve) => {
      const waiter = (session: BrowserSession | null): void => {
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
    try {
      // Share the restoration started when the callback page was constructed.
      if (!oauthError && this.supabase.auth.serverManaged) await this.initialize();
      await this.lifecycle.authenticate(undefined, async (assertCurrent) => {
        if (oauthError) throw new Error(oauthError);
        assertCurrent();
        const { data, error } = this.supabase.auth.serverManaged
          ? { data: { session: this.session() }, error: null }
          : await this.supabase.auth.getSession();
        assertCurrent();
        if (error) throw new Error(error.message);
        const session = data.session;
        if (!session?.user.id) throw new Error('Google sign-in did not return a session.');
        this.session.set(session);
        if (!this.supabase.auth.serverManaged) {
          this.profileLoadSequence += 1;
          this.activeProfileLoad = null;
          this.currentCustomerProfile.set(null);
        }
        await this.synchronizeProfileForSession(session, !this.supabase.auth.serverManaged);
        assertCurrent();
        this.requireCustomerProfile();
      }, () => this.clearState());
      const returnUrl = this.readOAuthReturnUrl();
      return this.isSafeCustomerReturnUrl(returnUrl) ? returnUrl : '/shop';
    } finally {
      this.clearOAuthReturnUrl();
    }
  }

  async register(request: RegisterRequest): Promise<CustomerSignupResult> {
    return this.lifecycle.authenticate(true, async (assertCurrent) => {
      const email = request.email.trim().toLowerCase();
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password: request.password,
        options: { data: {
          full_name: request.fullName.trim(), phone: request.phone.trim(), role: 'customer',
        } },
      });
      assertCurrent();
      if (error) throw error;
      if (data.confirmationRequired) return { status: 'confirmation-required', email };
      if (!data.user?.id) throw new Error('Supabase did not return a user after signup.');
      if (!data.session) return { status: 'confirmation-required', email };
      this.session.set(data.session);
      await this.synchronizeProfileForSession(data.session, !this.supabase.auth.serverManaged);
      assertCurrent();
      this.requireCustomerProfile();
      return { status: 'authenticated', session: data.session };
    }, () => this.clearState());
  }

  async logout(navigate = true): Promise<LogoutResult> {
    const result = await this.lifecycle.logout(() => this.clearState());
    if (navigate) await this.router.navigate(['/shop'], { replaceUrl: true });
    return result;
  }

  private clearState(): void {
    this.currentCustomerProfile.set(null);
    this.session.set(null);
    this.passwordRecoverySession.set(null);
    for (const waiter of this.passwordRecoveryWaiters) waiter(null);
    this.passwordRecoveryWaiters.clear();
    this.lastLoadedProfileUserId = null;
    this.profileLoadSequence += 1;
    this.activeProfileLoad = null;
    this.initialized = Promise.resolve();
    this.clearOAuthReturnUrl();
  }

  private requireCustomerProfile(): AuthenticatedUserProfile {
    const profile = this.currentCustomerProfile();
    if (!profile || profile.roles?.name !== 'customer') throw new Error('Customer profile not found.');
    if (profile.is_active !== true) throw new Error('Your account is inactive.');
    return profile;
  }

  async getCurrentCustomerProfile(): Promise<AuthenticatedUserProfile | null> {
    await this.initialize();
    await this.synchronizeProfileForSession(this.session());
    return this.currentCustomerProfile();
  }

  async refreshCurrentCustomerProfile(): Promise<AuthenticatedUserProfile | null> {
    await this.initialize();
    this.supabase.auth.invalidateCustomerProfile?.();
    await this.synchronizeProfileForSession(this.session(), true);
    return this.currentCustomerProfile();
  }

  async getCurrentUserId(): Promise<string | null> {
    await this.initialize();
    if (!this.lifecycle.acceptsSession || !this.isAuthenticated()) return null;
    return this.isAuthenticated() ? this.user()?.id ?? null : null;
  }

  async updateProfile(updates: CustomerProfileUpdate): Promise<AuthenticatedUserProfile> {
    const payload = customerProfilePayload(updates);
    const version = this.lifecycle.version;
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to update your profile.');
    this.supabase.auth.invalidateCustomerProfile?.();
    this.profileLoadSequence += 1;
    this.activeProfileLoad = null;
    this.lastLoadedProfileUserId = undefined;
    const { data, error } = await this.supabase.from('profiles').update(payload).eq('id', userId).select(this.profileSelect).single();
    if (error) throw new Error(error.message);
    const profile = data as unknown as AuthenticatedUserProfile;
    if (!this.lifecycle.isCurrent(version) || profile.is_active !== true || profile.roles?.name !== 'customer') throw new Error('Customer profile not found.');
    this.supabase.auth.invalidateCustomerProfile?.();
    this.profileLoadSequence += 1;
    this.activeProfileLoad = null;
    this.lastLoadedProfileUserId = userId;
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
    const version = this.lifecycle.version;
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw new Error(error.message);
      if (!this.lifecycle.isCurrent(version)) return;
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
    session: BrowserSession | null,
    force = false,
  ): Promise<void> {
    const userId = session?.user.id ?? null;

    const validatedProfile = this.supabase.auth.customerProfile;
    if (!force && this.supabase.auth.serverManaged && session && validatedProfile !== undefined) {
      this.profileLoadSequence += 1;
      this.activeProfileLoad = null;
      this.currentCustomerProfile.set(validatedProfile?.id === userId &&
        validatedProfile.is_active === true && validatedProfile.roles?.name === 'customer' ? validatedProfile : null);
      this.lastLoadedProfileUserId = userId;
      return;
    }

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

  private async loadProfileForSession(session: BrowserSession | null): Promise<void> {
    const sequence = ++this.profileLoadSequence;
    const userId = session?.user.id ?? null;

    if (!userId) {
      this.currentCustomerProfile.set(null);
      this.lastLoadedProfileUserId = null;
      return;
    }

    let profile: AuthenticatedUserProfile | null;
    try {
      profile = await this.getCustomerProfileById(userId);
    } catch (error: unknown) {
      if (sequence === this.profileLoadSequence) {
        this.currentCustomerProfile.set(null);
        this.lastLoadedProfileUserId = undefined;
      }
      throw error;
    }
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

  private handlePasswordRecoveryEvent(event: AuthChangeEvent, session: BrowserSession | null): void {
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
    try {
      storage.setItem(
        CUSTOMER_OAUTH_RETURN_URL_KEY,
        this.isSafeCustomerReturnUrl(returnUrl) ? returnUrl : '/shop',
      );
    } catch {
      // OAuth can still return to the shop when browser persistence is unavailable.
    }
  }

  private readOAuthReturnUrl(): string | null {
    try {
      return this.sessionStorage()?.getItem(CUSTOMER_OAUTH_RETURN_URL_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private clearOAuthReturnUrl(): void {
    try {
      this.sessionStorage()?.removeItem(CUSTOMER_OAUTH_RETURN_URL_KEY);
    } catch {
      // A blocked storage operation must not interrupt the authentication callback.
    }
  }

  private sessionStorage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  async uploadCurrentUserAvatar(file: File): Promise<string> {
    const userId = await this.getCurrentUserId();

    if (!userId) {
      throw new Error('You must be logged in to upload a profile image.');
    }

    return uploadAvatar(this.supabase, userId, file);
  }
}
