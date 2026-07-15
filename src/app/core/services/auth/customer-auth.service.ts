import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CUSTOMER_SUPABASE } from '../../tokens';
import {
  AppRoleName,
  AuthenticatedUserProfile,
  LoginRequest,
  RegisterRequest,
  UserProfile,
} from '../../models/auth';

@Injectable({ providedIn: 'root' })
export class CustomerAuthService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly router = inject(Router);

  readonly currentCustomerProfile = signal<AuthenticatedUserProfile | null>(null);

  async login(request: LoginRequest, returnUrl?: string | null): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: request.email,
      password: request.password,
    });

    if (error) throw new Error(error.message);

    const userId = data.user?.id;
    if (!userId) throw new Error('User not found.');

    const profile = await this.getCustomerProfileById(userId);
    if (!profile) {
      await this.logout(false);
      throw new Error('Customer profile not found.');
    }

    if (!profile.is_active) {
      await this.logout(false);
      throw new Error('Your account is inactive.');
    }

    this.currentCustomerProfile.set(profile);

    if (returnUrl?.startsWith('/shop') && !returnUrl.startsWith('//')) {
      await this.router.navigateByUrl(returnUrl);
    } else {
      await this.router.navigate(['/shop']);
    }
  }

  async register(request: RegisterRequest): Promise<void> {
    const { data, error } = await this.supabase.auth.signUp({
      email: request.email,
      password: request.password,
      options: {
        data: {
          full_name: request.fullName,
          phone: request.phone,
        },
      },
    });

    if (error) throw new Error(error.message);

    const userId = data.user?.id;
    if (!userId) throw new Error('Registration completed. Please verify your email.');

    const customerRoleId = await this.getRoleIdByName('customer');
    const { error: profileError } = await this.supabase.from('profiles').insert({
      id: userId,
      role_id: customerRoleId,
      full_name: request.fullName,
      email: request.email,
      phone: request.phone,
      is_active: true,
    });

    if (profileError) throw new Error(profileError.message);
  }

  async logout(navigate = true): Promise<void> {
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) console.error('Failed to clear the local customer auth session.', error);

    this.currentCustomerProfile.set(null);
    if (navigate) await this.router.navigate(['/shop'], { replaceUrl: true });
  }

  async getCurrentCustomerProfile(): Promise<AuthenticatedUserProfile | null> {
    const profile = await this.getCurrentCustomerProfileFromSession();
    this.currentCustomerProfile.set(profile);
    return profile;
  }

  async getCurrentUserId(): Promise<string | null> {
    const profile = await this.getCurrentCustomerProfileFromSession();
    return profile?.id ?? null;
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

  private async getCurrentCustomerProfileFromSession(): Promise<AuthenticatedUserProfile | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw new Error(error.message);

    const userId = data.session?.user.id;
    if (!userId) return null;
    return this.getCustomerProfileById(userId);
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

  private async getRoleIdByName(roleName: AppRoleName): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .maybeSingle();

    if (error) {
      console.warn(`${roleName} role not found. role_id will be null.`);
      return null;
    }

    return (data as Pick<UserProfile, 'id'> | null)?.id ?? null;
  }
}
