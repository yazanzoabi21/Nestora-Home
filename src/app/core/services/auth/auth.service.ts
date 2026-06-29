import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { SupabaseService } from '../supabase';
import {
    AppRoleName,
    AuthenticatedUserProfile,
    CurrentUserProfileUpdate,
    LoginRequest,
    RegisterRequest,
    UserProfile,
    UserRole,
} from '../../models/auth';

const AVATAR_STORAGE_BUCKET = 'avatars';
const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024;
const MISSING_AVATAR_BUCKET_MESSAGE =
    'Avatar storage bucket is missing. Please create a Supabase Storage bucket named avatars.';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private readonly supabase = inject(SupabaseService).client;
    private readonly router = inject(Router);

    readonly currentUserProfile = signal<AuthenticatedUserProfile | null>(null);

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
        const { error } = await this.supabase.auth.signOut({ scope: 'local' });

        if (error) {
            console.error('Failed to clear the local auth session.', error);
        }

        this.currentUserProfile.set(null);

        await this.router.navigate(['/auth/login'], {
            replaceUrl: true,
        });
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

    async getCurrentUserProfile(): Promise<AuthenticatedUserProfile | null> {
        const userId = await this.getCurrentUserId();

        if (!userId) {
            this.currentUserProfile.set(null);
            return null;
        }

        const { data, error } = await this.supabase
            .from('profiles')
            .select(this.profileSelect)
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        const profile = data as AuthenticatedUserProfile | null;
        this.currentUserProfile.set(profile);

        return profile;
    }

    async updateCurrentUserProfile(updates: CurrentUserProfileUpdate): Promise<AuthenticatedUserProfile> {
        const userId = await this.getCurrentUserId();

        if (!userId) {
            throw new Error('You must be signed in to update your profile.');
        }

        const { data, error } = await this.supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select(this.profileSelect)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        if (!data) {
            throw new Error('Profile not found.');
        }

        const profile = data as unknown as AuthenticatedUserProfile;
        this.currentUserProfile.set(profile);

        return profile;
    }

    async uploadCurrentUserAvatar(file: File): Promise<string> {
        const userId = await this.getCurrentUserId();

        if (!userId) {
            throw new Error('You must be signed in to upload an avatar.');
        }

        if (!file.type.startsWith('image/')) {
            throw new Error('Please select a valid image file.');
        }

        if (file.size > MAX_AVATAR_SIZE_BYTES) {
            throw new Error('Avatar image must be 10 MB or smaller.');
        }

        const safeFileName = sanitizeFileName(file.name);
        const filePath = `${userId}/${Date.now()}-${safeFileName}`;

        // Supabase setup required:
        // Dashboard -> Storage -> New bucket -> name: "avatars".
        // The object is stored in bucket "avatars" at path "{userId}/{timestamp}-{safeFileName}".
        const { error } = await this.supabase.storage
            .from(AVATAR_STORAGE_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                contentType: file.type,
                upsert: false,
            });

        if (error) {
            throw new Error(formatAvatarUploadError(error.message));
        }

        const { data } = this.supabase.storage.from(AVATAR_STORAGE_BUCKET).getPublicUrl(filePath);

        return data.publicUrl;
    }

    async isAuthenticated(): Promise<boolean> {
        const { data } = await this.supabase.auth.getSession();
        return !!data.session;
    }

    private readonly profileSelect = `
        id,
        role_id,
        full_name,
        email,
        phone,
        avatar_url,
        is_active,
        created_at,
        roles (
            id,
            name,
            description
        )
    `;

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
                await this.router.navigate(['/admin'], { replaceUrl: true });
                break;

            case 'customer':
            default:
                await this.router.navigate(['/shop']);
                break;
        }
    }

    private async getCurrentUserId(): Promise<string | null> {
        const { data, error } = await this.supabase.auth.getSession();

        if (error) {
            throw new Error(error.message);
        }

        return data.session?.user.id ?? null;
    }
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
    if (message.toLowerCase().includes('bucket not found')) {
        return MISSING_AVATAR_BUCKET_MESSAGE;
    }

    return `Avatar upload failed. ${message}`;
}
