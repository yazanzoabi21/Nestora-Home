import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SupabaseService } from '../supabase';
import {
    AppRoleName,
    LoginRequest,
    RegisterRequest,
    UserProfile,
    UserRole,
} from '../../models/auth';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private readonly supabase = inject(SupabaseService).client;
    private readonly router = inject(Router);

    async login(request: LoginRequest): Promise<void> {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: request.email,
            password: request.password,
        });

        if (error) {
            throw new Error(error.message);
        }

        const userId = data.user?.id;

        if (!userId) {
            throw new Error('User not found.');
        }

        const profile = await this.getProfile(userId);

        if (!profile) {
            throw new Error('Profile not found.');
        }

        if (!profile.is_active) {
            await this.logout();
            throw new Error('Your account is inactive.');
        }

        await this.redirectByRole(profile.role_id);
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

        if (error) {
            throw new Error(error.message);
        }

        const userId = data.user?.id;

        if (!userId) {
            throw new Error('Registration completed. Please verify your email.');
        }

        const customerRoleId = await this.getRoleIdByName('customer');

        const { error: profileError } = await this.supabase
            .from('profiles')
            .insert({
                id: userId,
                role_id: customerRoleId,
                full_name: request.fullName,
                email: request.email,
                phone: request.phone,
                is_active: true,
            });

        if (profileError) {
            throw new Error(profileError.message);
        }

        await this.router.navigate(['/auth/login']);
    }

    async logout(): Promise<void> {
        await this.supabase.auth.signOut();
        await this.router.navigate(['/auth/login']);
    }

    async getProfile(userId: string): Promise<UserProfile | null> {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        return data as UserProfile;
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

        return data?.id ?? null;
    }

    private async redirectByRole(roleId: string | null): Promise<void> {
        if (!roleId) {
            await this.router.navigate(['/shop']);
            return;
        }

        const { data, error } = await this.supabase
            .from('roles')
            .select('name')
            .eq('id', roleId)
            .maybeSingle();

        if (error || !data?.name) {
            await this.router.navigate(['/shop']);
            return;
        }

        const role = data as Pick<UserRole, 'name'>;

        switch (role.name) {
            case 'super_admin':
                await this.router.navigate(['/super-admin']);
                break;

            case 'admin':
                await this.router.navigate(['/admin']);
                break;

            case 'customer':
            default:
                await this.router.navigate(['/shop']);
                break;
        }
    }
}
