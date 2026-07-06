export type PaymentMethodType = 'manual' | 'online' | 'bank_transfer' | 'wallet';
export type PaymentTransactionStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';

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

export interface PaymentTransaction {
  id: string;
  order_id: string | null;
  payment_method_id: string | null;
  transaction_code: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  method_code: string;
  method_name: string;
  provider: string | null;
  amount: number;
  fee_amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  reference: string | null;
  provider_transaction_id: string | null;
  notes: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  config: Record<string, unknown>;
}

export interface PaymentTransactionStats {
  totalRevenue: number;
  gatewayFees: number;
  failedPayments: number;
  refundedTotal: number;
}
