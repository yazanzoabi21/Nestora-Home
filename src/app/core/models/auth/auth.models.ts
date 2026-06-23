export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    fullName: string;
    email: string;
    phone: string;
    password: string;
}

export type AppRoleName = 'super_admin' | 'admin' | 'customer';

export interface UserProfile {
    id: string;
    role_id: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    is_active: boolean | null;
    created_at?: string | null;
}

export interface UserRole {
    id: string;
    name: AppRoleName;
}
