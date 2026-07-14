import { CurrencyPipe } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth';
import { SupabaseService, ToastService } from '../../../core/services';
import {
  PaymentMethod,
  PaymentsService,
  ShippingMethodZone,
  ShippingService,
} from '../../../data-access';
import { CustomerShoppingStateService } from '../services';
import {
  CheckoutConfirmation,
  CheckoutStep,
  CheckoutTotals,
  DeliveryOption,
  ShippingInformation,
} from './checkout.models';

interface PlaceOrderRpcResult {
  order_id: string;
  order_number: string;
  payment_status: string;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class CustomerCheckoutStateService {
  readonly shopping = inject(CustomerShoppingStateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly shippingService = inject(ShippingService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly supabase = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);

  readonly currentStep = signal<CheckoutStep>('shipping');
  readonly shippingInfo = signal<ShippingInformation | null>(null);
  readonly deliveryOptions = signal<DeliveryOption[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly selectedDeliveryId = signal<string | null>(null);
  readonly selectedPaymentId = signal<string | null>(null);
  readonly paymentReference = signal('');
  readonly loadingOptions = signal(false);
  readonly submitting = signal(false);
  readonly confirmation = signal<CheckoutConfirmation | null>(null);

  readonly selectedDelivery = computed(
    () => this.deliveryOptions().find((option) => option.id === this.selectedDeliveryId()) ?? null,
  );
  readonly subtotal = computed(() =>
    this.shopping.cart().reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  );
  readonly discount = computed(() => 0);
  readonly deliveryFee = computed(() => this.selectedDelivery()?.fee ?? 0);
  readonly amountBeforePayment = computed(() =>
    Math.max(0, this.subtotal() - this.discount() + this.deliveryFee()),
  );
  readonly availablePaymentMethods = computed(() => {
    const amount = this.amountBeforePayment();
    return this.paymentMethods().filter(
      (method) =>
        method.is_active &&
        (method.min_amount === null || amount >= method.min_amount) &&
        (method.max_amount === null || amount <= method.max_amount),
    );
  });
  readonly selectedPayment = computed(
    () =>
      this.availablePaymentMethods().find((method) => method.id === this.selectedPaymentId()) ??
      null,
  );
  readonly paymentFee = computed(() => {
    const method = this.selectedPayment();
    if (!method) return 0;
    return method.fee_fixed + (this.amountBeforePayment() * method.fee_percentage) / 100;
  });
  readonly totals = computed<CheckoutTotals>(() => ({
    subtotal: this.subtotal(),
    discount: this.discount(),
    delivery: this.deliveryFee(),
    paymentFee: this.paymentFee(),
    total: Math.max(0, this.amountBeforePayment() + this.paymentFee()),
  }));

  async initialize(): Promise<void> {
    this.currentStep.set('shipping');
    this.confirmation.set(null);
    await this.prefillProfile();
    await this.loadOptions();
  }

  async requireCheckoutAccess(): Promise<boolean> {
    if (this.shopping.loading()) {
      await this.shopping.initialize();
    }

    if (!this.shopping.cart().length) {
      await this.router.navigate(['/shop/cart']);
      return false;
    }

    return true;
  }

  canOpenStep(step: CheckoutStep): boolean {
    if (step === 'shipping') return true;
    if (step === 'delivery') return !!this.shippingInfo();
    if (step === 'payment') return !!this.shippingInfo() && !!this.selectedDelivery();
    return step === 'confirmed' && !!this.confirmation();
  }

  goToStep(step: CheckoutStep): void {
    if (this.canOpenStep(step)) {
      this.currentStep.set(step);
      this.scrollTop();
    }
  }

  saveShipping(info: ShippingInformation): void {
    this.shippingInfo.set(info);
    this.currentStep.set('delivery');
    this.scrollTop();
  }

  selectDelivery(id: string): void {
    this.selectedDeliveryId.set(id);
  }

  continueToPayment(): void {
    if (!this.selectedDelivery()) return;
    this.currentStep.set('payment');
    this.scrollTop();
  }

  selectPayment(id: string): void {
    this.selectedPaymentId.set(id);
  }

  setPaymentReference(reference: string): void {
    this.paymentReference.set(reference);
  }

  async placeOrder(): Promise<void> {
    const shipping = this.shippingInfo();
    const delivery = this.selectedDelivery();
    const payment = this.selectedPayment();
    const lines = this.shopping.cart();
    if (!shipping || !delivery || !payment || !lines.length || this.submitting()) return;

    const requiresProvider =
      payment.type === 'online' && payment.config?.['requires_online_payment'] === true;
    if (requiresProvider) {
      this.toast.error(
        'Payment provider required',
        'This online payment method needs a provider integration before it can process checkout.',
      );
      return;
    }

    this.submitting.set(true);
    try {
      const { data, error } = await this.supabase.rpc('place_customer_order', {
        p_shipping: shipping,
        p_delivery_method_id: delivery.methodId,
        p_shipping_method_zone_id: delivery.methodZoneId,
        p_payment_method_id: payment.id,
        p_payment_reference: this.paymentReference().trim() || null,
        p_expected_total: Number(this.totals().total.toFixed(2)),
        p_items: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });
      if (error) throw error;

      const result = Array.isArray(data)
        ? (data[0] as PlaceOrderRpcResult)
        : (data as PlaceOrderRpcResult);
      const customerName = `${shipping.firstName} ${shipping.lastName}`.trim();
      this.confirmation.set({
        orderId: result.order_id,
        orderNumber: result.order_number,
        customerName,
        paymentStatus: result.payment_status,
        paymentMethodName: payment.name,
        totals: { ...this.totals(), total: Number(result.total ?? this.totals().total) },
        lines: [...lines],
      });
      this.shopping.clearCompletedCart();
      this.currentStep.set('confirmed');
      this.toast.success('Order placed', 'Your order has been created.');
      this.scrollTop();
    } catch (error) {
      this.toast.error(
        'Order failed',
        error instanceof Error ? error.message : 'Unable to place your order.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  paymentInstructions(method: PaymentMethod): string | null {
    return method.instructions_en || method.description;
  }

  formatTotalLabel(currency: CurrencyPipe): string {
    return `Place Order · ${currency.transform(this.totals().total, 'USD', 'symbol', '1.2-2') ?? '$0.00'}`;
  }

  private async prefillProfile(): Promise<void> {
    if (this.shippingInfo()) return;
    const profile = await this.auth.getCurrentUserProfile().catch(() => null);
    if (!profile) return;
    const [firstName = '', ...rest] = (profile.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    this.shippingInfo.set({
      firstName,
      lastName: rest.join(' '),
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'Lebanon',
    });
  }

  private async loadOptions(): Promise<void> {
    this.loadingOptions.set(true);
    try {
      const [methods, methodZones, payments] = await Promise.all([
        this.shippingService.getShippingMethods(),
        this.shippingService.getShippingMethodZones(),
        this.paymentsService.getPaymentMethods(),
      ]);
      const options = methodZones
        .filter(
          (item) =>
            item.is_active && item.shipping_method?.is_active && item.delivery_zone?.is_active,
        )
        .map((item) => this.zoneOption(item))
        .concat(
          methods
            .filter(
              (method) =>
                method.is_active &&
                !methodZones.some((item) => item.shipping_method_id === method.id),
            )
            .map((method) => ({
              id: method.id,
              methodId: method.id,
              methodZoneId: null,
              name: method.name,
              code: method.code,
              description: method.description,
              icon: method.icon || 'pi pi-truck',
              eta: this.eta(method.eta_label, method.eta_min_days, method.eta_max_days),
              fee: this.freeAdjustedFee(method.base_cost, method.free_shipping_min_amount),
              freeOver: method.free_shipping_min_amount,
            })),
        )
        .filter((option) => option.fee >= 0)
        .sort((a, b) => a.fee - b.fee || a.name.localeCompare(b.name));

      this.deliveryOptions.set(options);
      this.paymentMethods.set(payments.filter((payment) => payment.is_active));
    } catch (error) {
      this.toast.error(
        'Checkout options failed',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      this.loadingOptions.set(false);
    }
  }

  private zoneOption(item: ShippingMethodZone): DeliveryOption {
    const method = item.shipping_method!;
    const zone = item.delivery_zone!;
    const fee = (item.cost_override ?? method.base_cost) + zone.extra_cost;
    const freeOver = item.free_shipping_min_amount_override ?? method.free_shipping_min_amount;
    return {
      id: item.id,
      methodId: item.shipping_method_id,
      methodZoneId: item.id,
      name: `${method.name}${zone.name ? ` · ${zone.name}` : ''}`,
      code: method.code,
      description: method.description,
      icon: method.icon || 'pi pi-truck',
      eta: this.eta(
        item.eta_label_override ?? method.eta_label,
        item.eta_min_days_override ?? method.eta_min_days,
        item.eta_max_days_override ?? method.eta_max_days,
      ),
      fee: this.freeAdjustedFee(fee, freeOver),
      freeOver,
    };
  }

  private eta(label: string | null, min: number | null, max: number | null): string {
    if (label) return label;
    if (min !== null && max !== null) return `${min}-${max} days`;
    if (min !== null) return `${min}+ days`;
    return 'Estimated at checkout';
  }

  private freeAdjustedFee(fee: number, freeOver: number | null): number {
    return freeOver !== null && this.subtotal() >= freeOver ? 0 : Number(fee.toFixed(2));
  }

  private scrollTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
