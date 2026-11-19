import { Injectable, inject, signal } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';

interface OrderEmailOwnership {
  orderId: string;
  checkoutToken: string;
}
const storageKey = 'nestora-order-email-verification';

@Injectable({ providedIn: 'root' })
export class OrderEmailVerificationService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private ownership: OrderEmailOwnership | null = null;
  readonly status = signal<'idle' | 'pending' | 'verified' | 'unavailable'>('idle');
  readonly busy = signal(false);
  readonly invalidCode = signal(false);

  constructor() {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (stored && typeof stored === 'object') {
        const value = stored as Record<string, unknown>;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof value['orderId'] === 'string' && uuid.test(value['orderId']) &&
          typeof value['checkoutToken'] === 'string' && uuid.test(value['checkoutToken']) &&
          typeof value['expiresAt'] === 'number' && value['expiresAt'] > Date.now()) {
          this.ownership = { orderId: value['orderId'], checkoutToken: value['checkoutToken'] };
          this.status.set('pending');
        }
      }
    } catch { /* Storage restrictions retain the in-memory checkout flow. */ }
  }

  // A tab-scoped capability permits verification after reload; never use URLs or analytics.
  start(orderId: string, checkoutToken: string): void {
    this.ownership = { orderId, checkoutToken };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...this.ownership, expiresAt: Date.now() + 86_400_000 }));
    } catch { /* Memory remains available when browser storage is blocked. */ }
    this.busy.set(false);
    this.status.set('pending');
    this.invalidCode.set(false);
    void this.request();
  }

  async request(): Promise<void> {
    await this.invoke('request');
  }

  async confirm(code: string): Promise<void> {
    if (!/^\d{8}$/.test(code)) {
      this.invalidCode.set(true);
      return;
    }
    await this.invoke('confirm', code);
  }

  private async invoke(action: 'request' | 'confirm', code?: string): Promise<void> {
    if (!this.ownership || this.busy()) return;
    const ownership = this.ownership;
    this.busy.set(true);
    this.invalidCode.set(false);
    try {
      const { data, error } = await this.supabase.functions.invoke<{
        verified?: boolean;
        requested?: boolean;
      }>('order-email-verification', { body: { ...ownership, action, ...(code ? { code } : {}) } });
      if (this.ownership !== ownership) return;
      if (error) {
        const invalid = action === 'confirm' && error.context instanceof Response && error.context.status === 400;
        this.status.set(invalid ? 'pending' : 'unavailable');
        this.invalidCode.set(invalid);
        return;
      }
      this.status.set(data?.verified ? 'verified' : 'pending');
      if (data?.verified) {
        try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      }
    } catch {
      if (this.ownership === ownership) this.status.set('unavailable');
    } finally {
      if (this.ownership === ownership) this.busy.set(false);
    }
  }
}
