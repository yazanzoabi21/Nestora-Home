import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';

@Injectable({ providedIn: 'root' })
export class CustomerNewsletterService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async subscribe(email: string): Promise<void> {
    // Do not request rows back: subscriber addresses are private, including for guests.
    const { error } = await this.supabase.from('newsletter_subscriptions').insert({
      email: email.trim().toLowerCase(),
    });

    // Repeat signups have the same outcome without reading or changing existing records.
    if (error && error.code !== '23505') throw error;
  }
}
