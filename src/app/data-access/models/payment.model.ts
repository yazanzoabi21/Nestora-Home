export type PaymentMethodType = 'manual' | 'online' | 'bank_transfer' | 'wallet';

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  type: PaymentMethodType;
  description: string | null;
  icon: string | null;
  instructions_en: string | null;
  instructions_ar: string | null;
  is_active: boolean;
  sort_order: number;
  min_amount: number | null;
  max_amount: number | null;
  fee_fixed: number;
  fee_percentage: number;
  config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface PaymentMethodPayload {
  code: string;
  name: string;
  provider: string | null;
  type: PaymentMethodType;
  description: string | null;
  icon: string | null;
  instructions_en: string | null;
  instructions_ar: string | null;
  is_active: boolean;
  sort_order: number;
  min_amount: number | null;
  max_amount: number | null;
  fee_fixed: number;
  fee_percentage: number;
  config: Record<string, unknown>;
}

export interface PaymentMethodStats {
  activeMethods: number;
  onlineMethods: number;
  manualMethods: number;
  disabledMethods: number;
}
