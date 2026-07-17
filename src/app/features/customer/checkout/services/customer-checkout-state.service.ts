import { CurrencyPipe } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CustomerShoppingStateService } from '../../services';
import {
  CheckoutConfirmation,
  CheckoutOrderItem,
  CheckoutPaymentMethod,
  CheckoutSelection,
  CheckoutShippingInformation,
  CheckoutShippingPrefill,
  CheckoutShippingMethod,
  CheckoutStep,
  CheckoutTotals,
  PlacedOrderResult,
} from '../models';
import { CustomerCheckoutDataService } from './customer-checkout-data.service';
import { splitFullName } from '../../../../shared/utils/name.util';

@Injectable({ providedIn: 'root' })
export class CustomerCheckoutStateService {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly data = inject(CustomerCheckoutDataService);

  private readonly _currentStep = signal<CheckoutStep>('shipping');
  private readonly _shippingInformation = signal<CheckoutShippingInformation | null>(null);
  private readonly _shippingPrefill = signal<CheckoutShippingPrefill | null>(null);
  private readonly _selectedShippingMethod = signal<CheckoutShippingMethod | null>(null);
  private readonly _selectedPaymentMethod = signal<CheckoutPaymentMethod | null>(null);
  private readonly _isPlacingOrder = signal(false);
  private readonly _placeOrderError = signal<string | null>(null);
  private readonly _placedOrder = signal<PlacedOrderResult | null>(null);
  private readonly _shippingMethods = signal<readonly CheckoutShippingMethod[]>([]);
  private readonly _paymentMethods = signal<readonly CheckoutPaymentMethod[]>([]);
  private readonly _loadingShippingMethods = signal(false);
  private readonly _loadingPaymentMethods = signal(false);
  private readonly _shippingMethodsError = signal<string | null>(null);
  private readonly _paymentMethodsError = signal<string | null>(null);
  private readonly _confirmation = signal<CheckoutConfirmation | null>(null);

  readonly currentStep = this._currentStep.asReadonly();
  readonly shippingInformation = this._shippingInformation.asReadonly();
  readonly shippingPrefill = this._shippingPrefill.asReadonly();
  readonly selectedShippingMethod = this._selectedShippingMethod.asReadonly();
  readonly selectedPaymentMethod = this._selectedPaymentMethod.asReadonly();
  readonly isPlacingOrder = this._isPlacingOrder.asReadonly();
  readonly placeOrderError = this._placeOrderError.asReadonly();
  readonly placedOrder = this._placedOrder.asReadonly();
  readonly shippingMethods = this._shippingMethods.asReadonly();
  readonly paymentMethods = this._paymentMethods.asReadonly();
  readonly loadingShippingMethods = this._loadingShippingMethods.asReadonly();
  readonly loadingPaymentMethods = this._loadingPaymentMethods.asReadonly();
  readonly shippingMethodsError = this._shippingMethodsError.asReadonly();
  readonly paymentMethodsError = this._paymentMethodsError.asReadonly();
  readonly confirmation = this._confirmation.asReadonly();

  readonly hasShippingInformation = computed(() => this._shippingInformation() !== null);
  readonly hasShippingMethod = computed(() => this._selectedShippingMethod() !== null);
  readonly hasPaymentMethod = computed(() => this._selectedPaymentMethod() !== null);
  readonly canContinueToDelivery = computed(() => this.hasShippingInformation());
  readonly canContinueToPayment = computed(
    () => this.hasShippingInformation() && this.hasShippingMethod(),
  );
  readonly canPlaceOrder = computed(
    () =>
      this.hasShippingInformation() &&
      this.hasShippingMethod() &&
      this.hasPaymentMethod() &&
      this.shopping.cart().length > 0 &&
      !this._isPlacingOrder(),
  );
  readonly subtotal = computed(() => this.shopping.subtotal());
  readonly shippingCost = computed(
    () => this._selectedShippingMethod()?.calculatedCost ?? 0,
  );
  readonly paymentFee = computed(() => this._selectedPaymentMethod()?.calculatedFee ?? 0);
  readonly checkoutSelection = computed<CheckoutSelection>(() => ({
    shippingInformation: this._shippingInformation(),
    shippingMethod: this._selectedShippingMethod(),
    paymentMethod: this._selectedPaymentMethod(),
  }));
  readonly checkoutItems = computed<readonly CheckoutOrderItem[]>(() =>
    this.shopping.cart().map((line) => ({
      productId: line.product.id,
      productName: line.product.name,
      productImageUrl: line.product.imageUrl || null,
      quantity: line.quantity,
      unitPrice: line.product.price,
      lineTotal: line.product.price * line.quantity,
    })),
  );

  readonly totals = computed<CheckoutTotals>(() => {
    const subtotal = this.subtotal();
    const shippingCost = this.shippingCost();
    const paymentFee = this.paymentFee();
    const discountAmount = this.shopping.discountAmount();
    const discountCode = this.shopping.appliedDiscount()?.code ?? null;

    return {
      subtotal,
      shippingCost,
      paymentFee,
      discountAmount,
      discountCode,
      total: Math.max(
        0,
        subtotal + shippingCost + paymentFee - discountAmount,
      ),
    };
  });

  async initialize(): Promise<void> {
    this._currentStep.set('shipping');
    this._placedOrder.set(null);
    this._confirmation.set(null);
    this._placeOrderError.set(null);
    await this.loadShippingPrefill();
    await this.loadShippingMethods();
  }

  async requireCheckoutAccess(): Promise<boolean> {
    if (this.shopping.loading()) await this.shopping.initialize();
    if (this.shopping.cart().length) return true;
    await this.router.navigate(['/shop/cart']);
    return false;
  }

  async loadShippingMethods(): Promise<void> {
    this._loadingShippingMethods.set(true);
    this._shippingMethodsError.set(null);
    try {
      const methods = await this.data.getShippingMethods(this.subtotal());
      this._shippingMethods.set(methods);
      const selectedId = this._selectedShippingMethod()?.id;
      this._selectedShippingMethod.set(
        methods.find((method) => method.id === selectedId) ?? null,
      );
    } catch (error) {
      this._shippingMethods.set([]);
      this._shippingMethodsError.set(this.errorMessage(error, 'Unable to load shipping methods.'));
    } finally {
      this._loadingShippingMethods.set(false);
    }
  }

  async loadPaymentMethods(): Promise<void> {
    this._loadingPaymentMethods.set(true);
    this._paymentMethodsError.set(null);
    try {
      const methods = await this.data.getPaymentMethods(this.subtotal() + this.shippingCost());
      this._paymentMethods.set(methods);
      const selectedId = this._selectedPaymentMethod()?.id;
      this._selectedPaymentMethod.set(
        methods.find((method) => method.id === selectedId) ?? null,
      );
    } catch (error) {
      this._paymentMethods.set([]);
      this._paymentMethodsError.set(this.errorMessage(error, 'Unable to load payment methods.'));
    } finally {
      this._loadingPaymentMethods.set(false);
    }
  }

  setShippingInformation(value: CheckoutShippingInformation): void {
    this._shippingInformation.set(value);
  }

  selectShippingMethod(value: CheckoutShippingMethod): void {
    this._selectedShippingMethod.set(value);
    this._selectedPaymentMethod.set(null);
    this._paymentMethods.set([]);
  }

  selectPaymentMethod(value: CheckoutPaymentMethod): void {
    this._selectedPaymentMethod.set(value);
    this._placeOrderError.set(null);
  }

  goToShipping(): void {
    this.setStep('shipping');
  }

  goToDelivery(): void {
    if (this.canContinueToDelivery()) this.setStep('delivery');
  }

  goToPayment(): void {
    if (!this.canContinueToPayment()) return;
    this.setStep('payment');
    void this.loadPaymentMethods();
  }

  goToConfirmation(): void {
    if (this._placedOrder()) this.setStep('confirmation');
  }

  canOpenStep(step: CheckoutStep): boolean {
    if (step === 'shipping') return true;
    if (step === 'delivery') return this.canContinueToDelivery();
    if (step === 'payment') return this.canContinueToPayment();
    return this._placedOrder() !== null;
  }

  goToStep(step: CheckoutStep): void {
    if (step === 'shipping') this.goToShipping();
    else if (step === 'delivery') this.goToDelivery();
    else if (step === 'payment') this.goToPayment();
    else this.goToConfirmation();
  }

  setPlacingOrder(value: boolean): void {
    this._isPlacingOrder.set(value);
  }

  setPlaceOrderError(value: string | null): void {
    this._placeOrderError.set(value);
  }

  setPlacedOrder(value: PlacedOrderResult | null): void {
    this._placedOrder.set(value);
    if (!value) {
      this._confirmation.set(null);
      return;
    }

    const shipping = this._shippingInformation();
    const payment = this._selectedPaymentMethod();
    this._confirmation.set({
      order: value,
      customerName: shipping ? `${shipping.firstName} ${shipping.lastName}`.trim() : '',
      paymentMethodName: payment?.name ?? '',
      items: [...this.checkoutItems()],
      totals: {
        subtotal: value.subtotal,
        shippingCost: value.shippingCost,
        paymentFee: value.paymentFee,
        discountAmount: value.discountAmount,
        discountCode: value.discountCode,
        total: value.total,
      },
    });
  }

  resetCheckout(): void {
    this._currentStep.set('shipping');
    this._shippingInformation.set(null);
    this._shippingPrefill.set(null);
    this._selectedShippingMethod.set(null);
    this._selectedPaymentMethod.set(null);
    this._isPlacingOrder.set(false);
    this._placeOrderError.set(null);
    this._placedOrder.set(null);
    this._shippingMethods.set([]);
    this._paymentMethods.set([]);
    this._shippingMethodsError.set(null);
    this._paymentMethodsError.set(null);
    this._confirmation.set(null);
  }

  paymentInstructions(method: CheckoutPaymentMethod): string | null {
    return method.instructionsEn || method.description;
  }

  formatTotalLabel(currency: CurrencyPipe): string {
    const total = currency.transform(this.totals().total, 'USD', 'symbol', '1.2-2') ?? '$0.00';
    return `Place Order - ${total}`;
  }

  private async loadShippingPrefill(): Promise<void> {
    if (this._shippingInformation()) return;

    await this.auth.initialize();
    if (!this.auth.isAuthenticated()) {
      this._shippingPrefill.set(null);
      return;
    }

    const profile = await this.auth.getCurrentCustomerProfile().catch(() => null);
    if (!profile) {
      this._shippingPrefill.set(null);
      return;
    }

    const names = splitFullName(profile.full_name);
    const prefill = this.compactPrefill({
      firstName: names.firstName,
      lastName: names.lastName,
      email: this.auth.user()?.email ?? profile.email,
      phone: profile.phone ?? undefined,
    });

    this._shippingPrefill.set(Object.keys(prefill).length > 0 ? prefill : null);
  }

  private compactPrefill(value: CheckoutShippingPrefill): CheckoutShippingPrefill {
    return Object.fromEntries(
      Object.entries(value).filter(([, fieldValue]) => fieldValue?.trim()),
    ) as CheckoutShippingPrefill;
  }

  private setStep(step: CheckoutStep): void {
    this._currentStep.set(step);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
