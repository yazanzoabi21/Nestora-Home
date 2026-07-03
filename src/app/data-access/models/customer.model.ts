export type CustomerStatus = 'Active' | 'Inactive' | 'Blocked';
export type CustomerTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface AdminCustomer {
  id: string;
  profileId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: CustomerStatus;
  tier: CustomerTier;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
