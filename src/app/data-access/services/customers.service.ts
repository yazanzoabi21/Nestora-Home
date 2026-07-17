import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import { AdminCustomer, CustomerStatus, CustomerTier } from '../models';

const CUSTOMER_SELECT = `
  id,
  profile_id,
  full_name,
  email,
  phone,
  avatar_url,
  status,
  tier,
  total_orders,
  total_spent,
  last_order_at,
  address,
  city,
  country,
  notes,
  created_at,
  updated_at
`;

@Injectable({
  providedIn: 'root',
})
export class CustomersService {
  private readonly supabase = inject(SupabaseService).client;

  async getCustomers(): Promise<AdminCustomer[]> {
    const { data, error } = await this.supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((customer) => this.mapCustomer(customer as unknown as Record<string, unknown>));
  }

  private mapCustomer(customer: Record<string, unknown>): AdminCustomer {
    const status = this.normalizeStatus(String(customer['status'] ?? ''));
    const tier = this.normalizeTier(String(customer['tier'] ?? ''));

    return {
      id: String(customer['id'] ?? ''),
      profileId: customer['profile_id'] ? String(customer['profile_id']) : null,
      fullName: this.toDisplayName(customer['full_name']),
      email: customer['email'] ? String(customer['email']) : null,
      phone: customer['phone'] ? String(customer['phone']) : null,
      avatarUrl: customer['avatar_url'] ? String(customer['avatar_url']) : null,
      status,
      tier,
      totalOrders: Number(customer['total_orders'] ?? 0),
      totalSpent: Number(customer['total_spent'] ?? 0),
      lastOrderAt: customer['last_order_at'] ? String(customer['last_order_at']) : null,
      address: customer['address'] ? String(customer['address']) : null,
      city: customer['city'] ? String(customer['city']) : null,
      country: customer['country'] ? String(customer['country']) : null,
      notes: customer['notes'] ? String(customer['notes']) : null,
      createdAt: String(customer['created_at'] ?? ''),
      updatedAt: String(customer['updated_at'] ?? ''),
    };
  }

  private normalizeStatus(value: string): CustomerStatus {
    switch (value.trim().toLowerCase()) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'blocked':
        return 'Blocked';
      default:
        return 'Active';
    }
  }

  private normalizeTier(value: string): CustomerTier {
    switch (value.trim().toLowerCase()) {
      case 'bronze':
        return 'Bronze';
      case 'silver':
        return 'Silver';
      case 'gold':
        return 'Gold';
      case 'platinum':
        return 'Platinum';
      default:
        return 'Bronze';
    }
  }

  private toDisplayName(value: unknown): string {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ');
    return name || 'Unknown Customer';
  }
}
