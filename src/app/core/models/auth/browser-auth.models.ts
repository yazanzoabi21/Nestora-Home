import type { AuthChangeEvent, SupabaseClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { AuthenticatedUserProfile } from './auth.models';

/** Intentionally has no access token, refresh token or JWT expiry fields. */
export interface BrowserUser {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}
export interface BrowserSession { user: BrowserUser }
export interface BrowserAuthResponse {
  data: { user: BrowserUser | null; session: BrowserSession | null; confirmationRequired?: boolean; profile?: AuthenticatedUserProfile | null };
  error: Error | null;
}
type SdkAuth = SupabaseClient['auth'];
export interface BrowserAuthClient {
  readonly serverManaged?: boolean;
  /** In-memory Customer profile from the latest validated BFF response. */
  readonly customerProfile?: AuthenticatedUserProfile | null;
  invalidateCustomerProfile?(): void;
  getSession(): Promise<{ data: { session: BrowserSession | null; profile?: AuthenticatedUserProfile | null }; error: Error | null }>;
  getUser(): Promise<{ data: { user: BrowserUser | null }; error: Error | null }>;
  signInWithPassword(request: { email: string; password: string }): Promise<BrowserAuthResponse>;
  signUp(request: Parameters<SdkAuth['signUp']>[0]): Promise<BrowserAuthResponse>;
  signInWithOAuth(request: Parameters<SdkAuth['signInWithOAuth']>[0]): Promise<{
    data: { provider: Parameters<SdkAuth['signInWithOAuth']>[0]['provider']; url: string | null }; error: Error | null;
  }>;
  resetPasswordForEmail(email: string, options?: Parameters<SdkAuth['resetPasswordForEmail']>[1]): Promise<{ data: object | null; error: Error | null }>;
  updateUser(request: Parameters<SdkAuth['updateUser']>[0]): Promise<{ data: { user: BrowserUser | null }; error: Error | null }>;
  changePassword?(currentPassword: string, newPassword: string): Promise<{ error: Error | null }>;
  signOut(options?: { scope: 'local' }): Promise<{ error: Error | null; localSessionCleared?: boolean }>;
  startAutoRefresh(): Promise<void>;
  stopAutoRefresh(): Promise<void>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: BrowserSession | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}

export interface AppRealtimeFilter {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  filter?: string;
}
export type AppRealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;
export interface AppRealtimeChannel {
  on(type: 'postgres_changes', filter: AppRealtimeFilter, callback: (payload: AppRealtimePayload) => void): AppRealtimeChannel;
  subscribe(): AppRealtimeChannel;
  unsubscribe(): Promise<string>;
}
export type NestoraSupabaseClient = Pick<SupabaseClient, 'from' | 'rpc' | 'storage'> & {
  auth: BrowserAuthClient;
  channel(name: string): AppRealtimeChannel;
  removeChannel(channel: AppRealtimeChannel): Promise<string>;
};
