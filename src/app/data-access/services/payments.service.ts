import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  PaymentMethod,
  PaymentMethodPayload,
  PaymentMethodStats,
  PaymentMethodType,
  PaymentTransaction,
  PaymentTransactionStats,
  PaymentTransactionStatus,
} from '../models';

const PAYMENT_METHOD_SELECT = `
  id,
  code,
  name,
  provider,
  type,
  description,
  icon,
  instructions_en,
  instructions_ar,
  is_active,
  sort_order,
  min_amount,
  max_amount,
  fee_fixed,
  fee_percentage,
  config,
  created_at,
  updated_at
`;

const PAYMENT_TRANSACTION_SELECT = `
  id,
  order_id,
  payment_method_id,
  transaction_code,
  order_number,
  customer_name,
  customer_email,
  method_code,
  method_name,
  provider,
  amount,
  fee_amount,
  currency,
  status,
  reference,
  provider_transaction_id,
  notes,
  paid_at,
  refunded_at,
  created_at,
  updated_at,
  config
`;

interface PaymentMethodRecord extends Omit<
  PaymentMethod,
  'type' | 'is_active' | 'sort_order' | 'min_amount' | 'max_amount' | 'fee_fixed' | 'fee_percentage' | 'config'
> {
  type: string | null;
  is_active: boolean | null;
  sort_order: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  fee_fixed: number | string | null;
  fee_percentage: number | string | null;
  config: Record<string, unknown> | null;
}

interface PaymentTransactionRecord extends Omit<
  PaymentTransaction,
  'amount' | 'fee_amount' | 'status' | 'config'
> {
  amount: number | string | null;
  fee_amount: number | string | null;
  status: string | null;
  config: Record<string, unknown> | null;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private readonly supabase = inject(SupabaseService).client;

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select(PAYMENT_METHOD_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Unable to load payment methods. ${error.message}`);
    }

    return (data ?? []).map((method) => this.mapPaymentMethod(method as PaymentMethodRecord));
  }

  async createPaymentMethod(payload: PaymentMethodPayload): Promise<PaymentMethod> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .insert(this.toPaymentMethodRecord(payload))
      .select(PAYMENT_METHOD_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to create payment method. ${error.message}`);
    }

    return this.mapPaymentMethod(data as PaymentMethodRecord);
  }

  async updatePaymentMethod(id: string, payload: Partial<PaymentMethodPayload>): Promise<PaymentMethod> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .update(this.toPaymentMethodRecord(payload))
      .eq('id', id)
      .select(PAYMENT_METHOD_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to update payment method. ${error.message}`);
    }

    return this.mapPaymentMethod(data as PaymentMethodRecord);
  }

  async deletePaymentMethod(id: string): Promise<void> {
    const { error } = await this.supabase.from('payment_methods').delete().eq('id', id);

    if (error) {
      throw new Error(`Unable to delete payment method. ${error.message}`);
    }
  }

  async togglePaymentMethod(method: PaymentMethod): Promise<PaymentMethod> {
    return this.updatePaymentMethod(method.id, { is_active: !method.is_active });
  }

  async getPaymentTransactions(): Promise<PaymentTransaction[]> {
    const { data, error } = await this.supabase
      .from('payment_transactions')
      .select(PAYMENT_TRANSACTION_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load payment transactions. ${error.message}`);
    }

    return (data ?? []).map((transaction) =>
      this.mapPaymentTransaction(transaction as PaymentTransactionRecord)
    );
  }

  getPaymentStats(transactions: PaymentTransaction[]): PaymentTransactionStats {
    return {
      totalRevenue: transactions
        .filter((transaction) => transaction.status === 'paid')
        .reduce((total, transaction) => total + transaction.amount, 0),
      gatewayFees: transactions.reduce((total, transaction) => total + transaction.fee_amount, 0),
      failedPayments: transactions.filter((transaction) => transaction.status === 'failed').length,
      refundedTotal: transactions
        .filter((transaction) => transaction.status === 'refunded')
        .reduce((total, transaction) => total + transaction.amount, 0),
    };
  }

  async refundTransaction(id: string): Promise<PaymentTransaction> {
    return this.updateTransactionStatus(id, {
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    });
  }

  async retryTransaction(id: string): Promise<PaymentTransaction> {
    return this.updateTransactionStatus(id, {
      status: 'pending',
    });
  }

  async markCodAsPaid(id: string): Promise<PaymentTransaction> {
    return this.updateTransactionStatus(id, {
      status: 'paid',
      paid_at: new Date().toISOString(),
    });
  }

  exportTransactionsCsv(transactions: PaymentTransaction[]): string {
    const header = [
      'Transaction',
      'Order',
      'Customer',
      'Email',
      'Method',
      'Provider',
      'Amount',
      'Fee',
      'Currency',
      'Status',
      'Reference',
      'Created At',
    ];

    return [
      header,
      ...transactions.map((transaction) => [
        transaction.transaction_code,
        transaction.order_number ?? '',
        transaction.customer_name ?? '',
        transaction.customer_email ?? '',
        transaction.method_name,
        transaction.provider ?? '',
        transaction.amount.toFixed(2),
        transaction.fee_amount.toFixed(2),
        transaction.currency,
        transaction.status,
        transaction.reference ?? transaction.provider_transaction_id ?? '',
        transaction.created_at ?? '',
      ]),
    ]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\n');
  }

  getPaymentMethodStats(methods: PaymentMethod[]): PaymentMethodStats {
    return {
      activeMethods: methods.filter((method) => method.is_active).length,
      onlineMethods: methods.filter((method) => method.type === 'online' || method.type === 'wallet').length,
      manualMethods: methods.filter((method) => method.type === 'manual' || method.type === 'bank_transfer').length,
      disabledMethods: methods.filter((method) => !method.is_active).length,
    };
  }

  /**
   * Future Whish flow:
   * checkout creates an order with payment_method_code='whish' and payment_status='pending';
   * a backend endpoint creates the Whish payment request, stores the transaction reference,
   * verifies Whish webhooks/callbacks, then updates order payment_status to paid or failed.
   */
  /**
   * COD flow:
   * checkout creates an order with payment_method_code='cod' and pending/unpaid status;
   * cash is collected on delivery, then an admin/manual process marks the order/payment as paid.
   */

  private toPaymentMethodRecord(payload: Partial<PaymentMethodPayload>): Partial<PaymentMethodPayload> {
    const record: Partial<PaymentMethodPayload> = {};

    if ('code' in payload) {
      record.code = payload.code?.trim().toLowerCase() ?? '';
    }

    if ('name' in payload) {
      record.name = payload.name?.trim() ?? '';
    }

    if ('provider' in payload) {
      record.provider = payload.provider?.trim() || null;
    }

    if ('type' in payload) {
      record.type = payload.type ?? 'manual';
    }

    if ('description' in payload) {
      record.description = payload.description?.trim() || null;
    }

    if ('icon' in payload) {
      record.icon = payload.icon?.trim() || null;
    }

    if ('instructions_en' in payload) {
      record.instructions_en = payload.instructions_en?.trim() || null;
    }

    if ('instructions_ar' in payload) {
      record.instructions_ar = payload.instructions_ar?.trim() || null;
    }

    if ('is_active' in payload) {
      record.is_active = payload.is_active;
    }

    if ('sort_order' in payload) {
      record.sort_order = Number(payload.sort_order ?? 0);
    }

    if ('min_amount' in payload) {
      record.min_amount = this.nullableNumber(payload.min_amount);
    }

    if ('max_amount' in payload) {
      record.max_amount = this.nullableNumber(payload.max_amount);
    }

    if ('fee_fixed' in payload) {
      record.fee_fixed = Number(payload.fee_fixed ?? 0);
    }

    if ('fee_percentage' in payload) {
      record.fee_percentage = Number(payload.fee_percentage ?? 0);
    }

    if ('config' in payload) {
      record.config = payload.config ?? {};
    }

    return record;
  }

  private mapPaymentMethod(method: PaymentMethodRecord): PaymentMethod {
    return {
      id: method.id,
      code: method.code ?? '',
      name: method.name ?? 'Payment method',
      provider: method.provider ?? null,
      type: this.paymentType(method.type),
      description: method.description ?? null,
      icon: method.icon ?? null,
      instructions_en: method.instructions_en ?? null,
      instructions_ar: method.instructions_ar ?? null,
      is_active: method.is_active ?? false,
      sort_order: this.numberValue(method.sort_order),
      min_amount: this.nullableNumber(method.min_amount),
      max_amount: this.nullableNumber(method.max_amount),
      fee_fixed: this.numberValue(method.fee_fixed),
      fee_percentage: this.numberValue(method.fee_percentage),
      config: method.config ?? {},
      created_at: method.created_at ?? null,
      updated_at: method.updated_at ?? null,
    };
  }

  private async updateTransactionStatus(
    id: string,
    payload: Partial<Pick<PaymentTransaction, 'status' | 'paid_at' | 'refunded_at'>>
  ): Promise<PaymentTransaction> {
    const { data, error } = await this.supabase
      .from('payment_transactions')
      .update(payload)
      .eq('id', id)
      .select(PAYMENT_TRANSACTION_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to update payment transaction. ${error.message}`);
    }

    return this.mapPaymentTransaction(data as PaymentTransactionRecord);
  }

  private mapPaymentTransaction(transaction: PaymentTransactionRecord): PaymentTransaction {
    return {
      id: transaction.id,
      order_id: transaction.order_id ?? null,
      payment_method_id: transaction.payment_method_id ?? null,
      transaction_code: transaction.transaction_code ?? '',
      order_number: transaction.order_number ?? null,
      customer_name: transaction.customer_name ?? null,
      customer_email: transaction.customer_email ?? null,
      method_code: transaction.method_code ?? '',
      method_name: transaction.method_name ?? '',
      provider: transaction.provider ?? null,
      amount: this.numberValue(transaction.amount),
      fee_amount: this.numberValue(transaction.fee_amount),
      currency: transaction.currency ?? 'USD',
      status: this.transactionStatus(transaction.status),
      reference: transaction.reference ?? null,
      provider_transaction_id: transaction.provider_transaction_id ?? null,
      notes: transaction.notes ?? null,
      paid_at: transaction.paid_at ?? null,
      refunded_at: transaction.refunded_at ?? null,
      created_at: transaction.created_at ?? null,
      updated_at: transaction.updated_at ?? null,
      config: transaction.config ?? {},
    };
  }

  private paymentType(value: string | null): PaymentMethodType {
    return value === 'online' || value === 'bank_transfer' || value === 'wallet' ? value : 'manual';
  }

  private transactionStatus(value: string | null): PaymentTransactionStatus {
    switch (value) {
      case 'paid':
      case 'failed':
      case 'refunded':
      case 'cancelled':
        return value;
      case 'pending':
      default:
        return 'pending';
    }
  }

  private nullableNumber(value: number | string | null | undefined): number | null {
    return value === null || value === undefined || value === '' ? null : Number(value);
  }

  private numberValue(value: number | string | null | undefined): number {
    return Number(value ?? 0);
  }

  private csvCell(value: string): string {
    const escaped = value.replace(/"/g, '""');

    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  }
}
