import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CustomerAddressesService, CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../../services';
import { CustomerAddress } from '../../models';
import {
  CheckoutConfirmation,
  CheckoutOrderItem,
  CheckoutPaymentMethod,
  CheckoutSelection,
  CheckoutShippingInformation,
  CheckoutShippingPrefill,
  CheckoutShippingSubmission,
  CheckoutShippingMethod,
  CheckoutStep,
  CheckoutTotals,
  PlacedOrderResult,
} from '../models';
import { CustomerCheckoutDataService } from './customer-checkout-data.service';
import { splitFullName } from '../../../../shared/utils/name.util';
import { CustomerGeographyService } from '../../services/customer-geography.service';

const CHECKOUT_DRAFT_KEY = 'nestora_checkout_shipping_v1';

interface CheckoutDraft extends CheckoutShippingSubmission {
  ownerId: string | null;
  selectedAddressId: string | null;
  shippingMethodId: string | null;
  paymentMethodId: string | null;
}

@Injectable()
export class CustomerCheckoutStateService {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly data = inject(CustomerCheckoutDataService);
  private readonly geography = inject(CustomerGeographyService);
  private readonly loyalty = inject(LoyaltyPointsCalculatorService);
  readonly addressBook = inject(CustomerAddressesService);

  private readonly _currentStep = signal<CheckoutStep>('shipping');
  private shippingEdited = false;
  private paymentMethodsRequest = 0;
  private preferredPaymentMethodId: string | null = null;
  private readonly _shippingConfirmed = signal(false);
  private readonly _shippingInformation = signal<CheckoutShippingInformation | null>(null);
  private readonly _shippingPrefill = signal<CheckoutShippingPrefill | null>(null);
  private readonly _selectedAddressId = signal<string | null>(null);
  private readonly _saveAddressForFuture = signal(false);
  private readonly _newAddressLabel = signal('Home');
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
  readonly savedAddresses = this.addressBook.addresses;
  readonly selectedAddressId = this._selectedAddressId.asReadonly();
  readonly saveAddressForFuture = this._saveAddressForFuture.asReadonly();
  readonly newAddressLabel = this._newAddressLabel.asReadonly();
  readonly shippingMethods = computed<readonly CheckoutShippingMethod[]>(() =>
    this._shippingMethods().map((method) => ({
      ...method,
      calculatedCost: this.calculateShippingCost(method),
    })),
  );
  readonly selectedShippingMethod = computed(() => {
    const selectedId = this._selectedShippingMethod()?.id;
    return this.shippingMethods().find((method) => method.id === selectedId) ?? null;
  });
  readonly selectedPaymentMethod = this._selectedPaymentMethod.asReadonly();
  readonly isPlacingOrder = this._isPlacingOrder.asReadonly();
  readonly placeOrderError = this._placeOrderError.asReadonly();
  readonly placedOrder = this._placedOrder.asReadonly();
  readonly paymentMethods = this._paymentMethods.asReadonly();
  readonly loadingShippingMethods = this._loadingShippingMethods.asReadonly();
  readonly loadingPaymentMethods = this._loadingPaymentMethods.asReadonly();
  readonly shippingMethodsError = this._shippingMethodsError.asReadonly();
  readonly paymentMethodsError = this._paymentMethodsError.asReadonly();
  readonly confirmation = this._confirmation.asReadonly();
  readonly isAuthenticated = this.auth.isAuthenticated;

  readonly hasShippingInformation = computed(() => this._shippingConfirmed() && this._shippingInformation() !== null);
  readonly hasShippingMethod = computed(() => this.selectedShippingMethod() !== null);
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
      !this._loadingPaymentMethods() &&
      this.shopping.cart().length > 0 &&
      !this._isPlacingOrder(),
  );
  readonly subtotal = computed(() => {
    return this.shopping.paidCart().reduce(
      (total, line) => this.loyalty.isRedemptionRequested(
        line.product.id,
        line.product.variantId,
      )
        ? total
        : total + line.product.price * line.quantity,
      0,
    );
  });
  readonly shippingCost = computed(
    () => this.selectedShippingMethod()?.calculatedCost ?? 0,
  );
  readonly paymentFee = computed(() => this._selectedPaymentMethod()?.calculatedFee ?? 0);
  readonly checkoutSelection = computed<CheckoutSelection>(() => ({
    shippingInformation: this._shippingInformation(),
    shippingMethod: this.selectedShippingMethod(),
    paymentMethod: this._selectedPaymentMethod(),
  }));
  readonly checkoutItems = computed<readonly CheckoutOrderItem[]>(() => {
    return this.shopping.cart().map((line) => ({
      productId: line.product.id,
      variantId: line.product.variantId ?? null,
      variantLabel: line.product.variantLabel ?? null,
      productName: line.product.name,
      productImageUrl: line.product.imageUrl || null,
      quantity: line.quantity,
      unitPrice: line.isFreeGift ? 0 : line.product.price,
      originalUnitPrice: line.product.price,
      lineTotal: line.isFreeGift ? 0 : line.product.price * line.quantity,
      isFreeGift: line.isFreeGift,
      appliedDiscountCode: line.appliedDiscountCode,
      redeemWithPoints: !line.isFreeGift && this.loyalty.isRedemptionRequested(
        line.product.id,
        line.product.variantId,
      ),
      loyaltyPointsCost: this.loyalty.isRedemptionRequested(
        line.product.id,
        line.product.variantId,
      )
        ? this.loyalty.preview(line.product.price).rewardCost * line.quantity
        : 0,
    }));
  });

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
  readonly estimatedLoyaltyPoints = computed(() =>
    this.auth.isAuthenticated()
      ? this.loyalty.estimateOrderPoints(
        this.subtotal(),
        this.shopping.discountAmount(),
      )
      : 0,
  );
  readonly isCashOnDelivery = computed(
    () => this._selectedPaymentMethod()?.code.trim().toLowerCase() === 'cod',
  );

  async initialize(): Promise<void> {
    this._currentStep.set('shipping');
    this._placedOrder.set(null);
    this._confirmation.set(null);
    this._placeOrderError.set(null);
    await this.auth.initialize();
    const preferredShippingMethodId = await this.restoreShippingDraft();
    await Promise.all([this.loadShippingPrefill(), this.loadShippingMethods(preferredShippingMethodId)]);
  }

  async requireCheckoutAccess(): Promise<boolean> {
    if (this.shopping.loading()) await this.shopping.initialize();
    if (this.shopping.cart().length) return true;
    this.clearShippingDraft();
    await this.router.navigate(['/shop/cart']);
    return false;
  }

  async loadShippingMethods(preferredId: string | null = null): Promise<void> {
    this._loadingShippingMethods.set(true);
    this._shippingMethodsError.set(null);
    try {
      const methods = await this.data.getShippingMethods();
      this._shippingMethods.set(methods);
      const selectedId = this._selectedShippingMethod()?.id ?? preferredId;
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
    const request = ++this.paymentMethodsRequest;
    this._loadingPaymentMethods.set(true);
    this._paymentMethodsError.set(null);
    try {
      const methods = await this.data.getPaymentMethods(this.subtotal() + this.shippingCost());
      if (request !== this.paymentMethodsRequest) return;
      this._paymentMethods.set(methods);
      const selectedId = this._selectedPaymentMethod()?.id ?? this.preferredPaymentMethodId;
      this._selectedPaymentMethod.set(
        methods.find((method) => method.id === selectedId) ?? null,
      );
    } catch (error) {
      if (request !== this.paymentMethodsRequest) return;
      this._selectedPaymentMethod.set(null);
      this._paymentMethods.set([]);
      this._paymentMethodsError.set(this.errorMessage(error, 'Unable to load payment methods.'));
    } finally {
      if (request === this.paymentMethodsRequest) this._loadingPaymentMethods.set(false);
    }
  }

  editShipping(): void {
    this.shippingEdited = true;
    this._shippingConfirmed.set(false);
  }

  setShippingInformation(submission: CheckoutShippingSubmission): void {
    this._shippingInformation.set(submission.shippingInformation);
    this._shippingConfirmed.set(true);
    this._placeOrderError.set(null);
    this._saveAddressForFuture.set(submission.saveForFuture && this.auth.isAuthenticated());
    this._newAddressLabel.set(submission.addressLabel.trim() || 'Home');
    this.saveShippingDraft();
  }

  selectSavedAddress(id: string): void {
    const address = this.savedAddresses().find((item) => item.id === id);
    if (!address) return;
    this.editShipping();
    this.clearShippingDraft();
    this._selectedAddressId.set(id);
    this._saveAddressForFuture.set(false);
    this._shippingInformation.set(this.addressToShipping(address));
  }

  onSavedAddressRemoved(id: string): void {
    if (this._selectedAddressId() === id) this.useNewAddress();
  }

  useNewAddress(): void {
    this.editShipping();
    this.clearShippingDraft();
    this._selectedAddressId.set(null);
    this._saveAddressForFuture.set(false);
    this._shippingInformation.set(null);
  }

  markPendingAddressSaved(address: CustomerAddress): void {
    this._selectedAddressId.set(address.id);
    this._saveAddressForFuture.set(false);
    this.saveShippingDraft();
  }

  selectShippingMethod(value: CheckoutShippingMethod): void {
    if (this.isPlacingOrder()) return;
    this.paymentMethodsRequest++;
    this._loadingPaymentMethods.set(false);
    if (this._selectedShippingMethod()?.id !== value.id) this.preferredPaymentMethodId = null;
    this._selectedShippingMethod.set(value);
    this._selectedPaymentMethod.set(null);
    this._paymentMethods.set([]);
    this.saveShippingDraft();
  }

  selectPaymentMethod(value: CheckoutPaymentMethod): void {
    if (this.isPlacingOrder()) return;
    this._selectedPaymentMethod.set(value);
    this.preferredPaymentMethodId = value.id;
    this._placeOrderError.set(null);
    this.saveShippingDraft();
  }

  goToShipping(): void {
    this.setStep('shipping');
  }

  goToDelivery(): void {
    if (this.canContinueToDelivery()) this.setStep('delivery');
  }

  goToPayment(): void {
    if (this.isPlacingOrder() || !this.canContinueToPayment()) return;
    this.setStep('payment');
    void this.loadPaymentMethods();
  }

  goToConfirmation(): void {
    if (this._placedOrder()) this.setStep('confirmation');
  }

  canOpenStep(step: CheckoutStep): boolean {
    if (this.isPlacingOrder()) return false;
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

    this.clearShippingDraft();
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
    this.clearShippingDraft();
    this.shippingEdited = false;
    this._shippingConfirmed.set(false);
    this.paymentMethodsRequest++;
    this.preferredPaymentMethodId = null;
    this._loadingPaymentMethods.set(false);
    this._currentStep.set('shipping');
    this._shippingInformation.set(null);
    this._shippingPrefill.set(null);
    this._selectedAddressId.set(null);
    this._saveAddressForFuture.set(false);
    this._newAddressLabel.set('Home');
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

  private async restoreShippingDraft(): Promise<string | null> {
    try {
      const stored = this.document.defaultView?.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!stored || this.shippingEdited || this._shippingInformation()) return null;

      const draft: CheckoutDraft = JSON.parse(stored);
      const ownerId = this.checkoutDraftOwner();
      if (ownerId === undefined || draft?.ownerId !== ownerId || !draft.shippingInformation) {
        this.clearShippingDraft();
        return null;
      }

      this._shippingInformation.set(draft.shippingInformation);
      const { countryId, provinceId, cityId } = draft.shippingInformation;
      this._selectedAddressId.set(ownerId ? draft.selectedAddressId : null);
      this._saveAddressForFuture.set(!!ownerId && draft.saveForFuture);
      this._newAddressLabel.set(draft.addressLabel);
      this.preferredPaymentMethodId = draft.paymentMethodId;
      if (countryId && provinceId && cityId) {
        const available = await this.geography.isAvailable(countryId, provinceId, cityId).catch(() => false);
        if (available && !this.shippingEdited && this._shippingInformation() === draft.shippingInformation) {
          this._shippingConfirmed.set(true);
        }
      }
      return draft.shippingMethodId;
    } catch {
      this.clearShippingDraft();
      return null;
    }
  }

  private saveShippingDraft(): void {
    const shippingInformation = this._shippingInformation();
    const ownerId = this.checkoutDraftOwner();
    if (!this._shippingConfirmed() || !shippingInformation || ownerId === undefined) return;

    const draft: CheckoutDraft = {
      ownerId,
      shippingInformation,
      selectedAddressId: this._selectedAddressId(),
      saveForFuture: this._saveAddressForFuture(),
      addressLabel: this._newAddressLabel(),
      shippingMethodId: this._selectedShippingMethod()?.id ?? null,
      paymentMethodId: this.preferredPaymentMethodId,
    };
    try {
      this.document.defaultView?.sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Checkout can continue if the browser blocks tab storage.
    }
  }

  private clearShippingDraft(): void {
    try {
      this.document.defaultView?.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    } catch {
      // Checkout can continue if the browser blocks tab storage.
    }
  }

  private checkoutDraftOwner(): string | null | undefined {
    return this.auth.isAuthenticated() ? this.auth.user()?.id : null;
  }

  private async loadShippingPrefill(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      if (this._selectedAddressId()) {
        this._shippingInformation.set(null);
        this._shippingConfirmed.set(false);
      }
      this._selectedAddressId.set(null);
      this._saveAddressForFuture.set(false);
      this._shippingPrefill.set(null);
      return;
    }

    const profile = await this.auth.getCurrentCustomerProfile().catch(() => null);
    const profileNames = splitFullName(profile?.full_name);
    const profilePrefill = this.compactPrefill({
      firstName: profileNames.firstName,
      lastName: profileNames.lastName,
      email: this.auth.user()?.email ?? profile?.email,
      phone: profile?.phone ?? undefined,
    });
    this._shippingPrefill.set(Object.keys(profilePrefill).length > 0 ? profilePrefill : null);

    let addresses: readonly CustomerAddress[] = [];
    try {
      addresses = await this.addressBook.load();
    } catch {
      // Profile prefill and guest-style address entry remain available.
    }

    if (this._shippingInformation()) {
      const selectedId = this._selectedAddressId();
      if (selectedId && !addresses.some((address) => address.id === selectedId)) {
        this._selectedAddressId.set(null);
      }
      return;
    }

    if (this.shippingEdited) return;

    const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
    if (defaultAddress) {
      this._selectedAddressId.set(defaultAddress.id);
      this._shippingInformation.set(this.addressToShipping(defaultAddress));
      return;
    }

  }

  private addressToShipping(address: CustomerAddress): CheckoutShippingInformation {
    const names = splitFullName(address.fullName);
    return {
      firstName: names.firstName,
      lastName: names.lastName,
      email: this.auth.user()?.email ?? this.auth.customerProfile()?.email ?? '',
      phone: address.phone,
      streetAddress: address.streetAddress,
      addressLine2: address.apartmentOrBuilding,
      countryId: address.countryId,
      provinceId: address.provinceId,
      cityId: address.cityId,
      city: address.city,
      stateProvince: address.areaOrDistrict ?? '',
      country: address.country,
      deliveryInstructions: address.deliveryNotes,
    };
  }

  private compactPrefill(value: CheckoutShippingPrefill): CheckoutShippingPrefill {
    return Object.fromEntries(
      Object.entries(value).filter(([, fieldValue]) => fieldValue?.trim()),
    ) as CheckoutShippingPrefill;
  }

  private setStep(step: CheckoutStep): void {
    if (this.isPlacingOrder() && step !== 'confirmation') return;
    this._currentStep.set(step);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private calculateShippingCost(method: CheckoutShippingMethod): number {
    const discount = this.shopping.appliedDiscount();
    const hasApplicableFreeShipping =
      discount?.discount_type === 'free_shipping' &&
      this.subtotal() >= (discount.minimum_order_amount ?? 0);
    return hasApplicableFreeShipping ? 0 : method.baseCost;
  }
}
