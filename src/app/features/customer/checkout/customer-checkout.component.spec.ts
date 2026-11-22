import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';

import translations from '../../../../assets/i18n/translations.json';
import { TranslationService } from '../../../core/services/translation';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerAddress, CustomerAddressInput } from '../models';
import {
  CustomerAddressesService,
  CustomerShoppingStateService,
  LoyaltyPointsCalculatorService,
} from '../services';
import { CheckoutShippingComponent } from './checkout-shipping/checkout-shipping.component';
import { CustomerCheckoutComponent } from './customer-checkout.component';
import { CheckoutPaymentMethod, CheckoutShippingMethod, PlaceCustomerOrderRpcArgs } from './models';
import { CustomerCheckoutDataService } from './services';
import { CustomerGeographyService } from '../services/customer-geography.service';

const standard: CheckoutShippingMethod = {
  id: 'standard', code: 'standard', name: 'Standard Delivery', baseCost: 4, calculatedCost: 4,
  carrierName: null, description: null, icon: null, etaMinDays: null, etaMaxDays: null, etaLabel: null,
};

const pickup: CheckoutShippingMethod = {
  ...standard, id: 'pickup', code: 'pickup', name: 'Store Pickup', baseCost: 0, calculatedCost: 0,
};

const cod: CheckoutPaymentMethod = {
  id: 'cod', code: 'cod', name: 'Cash on Delivery', type: 'manual', provider: null, description: null,
  icon: null, instructionsEn: null, instructionsAr: null, minAmount: null, maxAmount: null,
  feeFixed: 0, feePercentage: 0, calculatedFee: 0, config: {},
};

const internationalPhone = '+44 7700 900123';

const saved: CustomerAddress = {
  id: 'default-address', userId: 'customer', label: 'Home', fullName: 'Saved Customer', phone: '70123456',
  streetAddress: 'Saved street', apartmentOrBuilding: null, city: 'Beirut',
  areaOrDistrict: 'Beirut', country: 'Lebanon', deliveryNotes: null,
  isDefault: true, createdAt: '', updatedAt: '',
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolveValue = resolve; });
  return { promise, resolve: resolveValue };
}

async function renderCheckout(
  authenticated = false,
  loadAddresses = async (): Promise<readonly CustomerAddress[]> => [saved],
  resolveUser = async (): Promise<string | null> => authenticated ? 'customer' : null,
  loadProfile = async (): Promise<{ full_name: string; phone?: string }> => ({ full_name: 'Account Customer' }),
  variantId: string | null = 'variant',
) {
  const cart = signal([{ id: 'cart-line', quantity: 1, product: {
    id: 'product', variantId, name: 'Product', price: 20,
  } }]);
  const rpc = vi.fn(async (_name: string, args: PlaceCustomerOrderRpcArgs) => {
    const delivery = args.p_shipping_method_id === standard.id ? 4 : 0;
    const subtotal = args.p_expected_subtotal;
    return {
      data: {
        order_id: 'order', order_number: 'ORDER-1', subtotal,
        shipping_cost: delivery, payment_fee: 0, discount_id: 'coupon', discount_code: 'SAVE',
        discount_amount: 2, total: subtotal - 2 + delivery, loyalty_points_earned: authenticated ? 3 : 0,
      },
      error: null,
    };
  });

  const addressAvailable = vi.fn(async () => true);
  const addresses = signal<readonly CustomerAddress[]>([]);
  const removeAddress = vi.fn(async (id: string) => {
    addresses.update((items) => items.filter((address) => address.id !== id));
  });
  const toast = { success: vi.fn(), error: vi.fn() };
  const createAddress = vi.fn(async (input: CustomerAddressInput) => ({
    ...saved, ...input, id: 'new-address',
  }));
  TestBed.configureTestingModule({
    imports: [CustomerCheckoutComponent],
    providers: [
      provideRouter([]), provideTranslateService({ lang: 'en' }),
      { provide: CUSTOMER_SUPABASE, useValue: { rpc } },
      { provide: ToastService, useValue: toast },
      { provide: CustomerAuthService, useValue: {
        isAuthenticated: () => authenticated, initialize: async () => undefined,
        getCurrentUserId: resolveUser, user: () => authenticated ? { id: 'customer', email: 'account@example.com' } : null,
        getCurrentCustomerProfile: loadProfile,
      } },
      { provide: CustomerAddressesService, useValue: {
        addresses, create: createAddress, remove: removeAddress, error: () => null, loading: () => false,
        load: async () => {
          const result = await loadAddresses();
          addresses.set(result);
          return result;
        },
      } },
      { provide: CustomerShoppingStateService, useValue: {
        cart, paidCart: cart, loading: () => false,
        checkoutCartId: () => authenticated ? 'cart' : null, discountAmount: () => 2,
        appliedDiscount: () => ({ id: 'coupon', code: 'SAVE' }), clearCompletedCart: vi.fn(),
      } },
      { provide: LoyaltyPointsCalculatorService, useValue: {
        isRedemptionRequested: () => false, estimateOrderPoints: () => 3,
        clearRedemptions: vi.fn(), refreshBalance: async () => undefined,
      } },
      { provide: CustomerGeographyService, useValue: {
        isAvailable: addressAvailable,
        countries: async () => [{ id: 'lb', iso_code: 'LB', name_en: 'Lebanon', name_ar: 'Lebanon' }],
        provinces: async () => [
          { id: 'beirut-region', name_en: 'Beirut', name_ar: 'Beirut' },
          { id: 'keserwan', name_en: 'Keserwan-Jbeil', name_ar: 'Keserwan-Jbeil' },
        ],
        cities: async (provinceId: string) => provinceId === 'keserwan'
          ? [{ id: 'jounieh', name_en: 'Jounieh', name_ar: 'Jounieh' }]
          : [{ id: 'beirut', name_en: 'Beirut', name_ar: 'Beirut' }],
      } },
      { provide: CustomerCheckoutDataService, useValue: {
        getShippingMethods: async () => [standard, pickup], getPaymentMethods: async () => [cod],
      } },
    ],
  });

  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(CustomerCheckoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.componentInstance;
  await vi.waitFor(() => expect(page.state.shippingMethods()).toHaveLength(2));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const shipping = (): CheckoutShippingComponent =>
    fixture.debugElement.query(By.directive(CheckoutShippingComponent)).componentInstance;
  const enter = (name: string, value: string): void => {
    const input = root.querySelector<HTMLInputElement>('input[name="' + name + '"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const selectLocation = async (field: 'province' | 'city', value: string): Promise<void> => {
    const id = 'checkout-location-' + field;
    const labels: Record<string, string> = {
      keserwan: 'Keserwan-Jbeil', jounieh: 'Jounieh', 'beirut-region': 'Beirut', '': 'CUSTOMER.LOCATION.clear_selection',
    };
    const trigger = (): HTMLButtonElement => root.querySelector<HTMLButtonElement>('#' + id)!;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(trigger().disabled).toBe(false);
    });
    trigger().click();
    fixture.detectChanges();
    const options = root.querySelectorAll<HTMLElement>('#' + id + '-listbox [role="option"]');
    const option = Array.from(options).find((row) => row.textContent?.trim() === labels[value]);
    expect(option).toBeDefined();
    option!.click();
    await fixture.whenStable();
  };
  const fill = async (): Promise<void> => {
    enter('firstName', '  Guest  ');
    enter('lastName', 'Customer');
    enter('email', 'buyer@example.com');
    enter('phone', '  ' + internationalPhone + '  ');
    await selectLocation('province', 'keserwan');
    await selectLocation('city', 'jounieh');
    enter('streetAddress', '  Main Street  ');
  };
  const payment = async (method: CheckoutShippingMethod): Promise<void> => {
    page.selectShippingMethod(method.id);
    page.state.goToPayment();
    await fixture.whenStable();
    page.selectPaymentMethod(cod.id);
    fixture.detectChanges();
  };
  return { fixture, page, root, shipping, enter, selectLocation, fill, payment, rpc, createAddress, cart, addressAvailable, removeAddress, toast };
}

describe('checkout shipping validation', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    localStorage.removeItem('nestora-language');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
  });

  for (const authenticated of [false, true]) {
    it('localizes checkout and requires a valid phone for ' + (authenticated ? 'signed-in checkout' : 'guest checkout'), async () => {
      const { fixture, page, root, shipping, fill, enter, payment, rpc } = await renderCheckout(
        authenticated, async () => [], undefined, async () => ({ full_name: 'Account Customer', phone: 'bad number' }),
      );
      const field = root.querySelector<HTMLInputElement>('#phone')!;
      if (authenticated) {
        await vi.waitFor(() => expect(field.value).toBe('bad number'));
        expect(shipping().form.controls.phone.invalid).toBe(true);
      }
      await fill();

      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', translations.en);
      translate.setTranslation('ar', translations.ar);
      const language = TestBed.inject(TranslationService);
      expect(root.querySelector('label[for="phone"]')?.textContent).toContain('*');
      expect(field.required).toBe(true);

      for (const lang of ['en', 'ar'] as const) {
        language.useLanguage(lang);
        fixture.detectChanges();
        expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
        const breadcrumb = root.querySelector('.checkout-breadcrumb')!;
        expect(Array.from(breadcrumb.querySelectorAll('a, [aria-current]'), (item) => item.textContent?.trim())).toEqual(
          lang === 'ar' ? ['الرئيسية', 'سلة التسوق', 'إتمام الطلب'] : ['Home', 'Cart', 'Checkout'],
        );
        expect(Array.from(root.querySelectorAll('.checkout-stepper button'), (item) => item.getAttribute('aria-label'))).toEqual(
          lang === 'ar' ? ['الشحن', 'التوصيل', 'الدفع'] : ['Shipping', 'Delivery', 'Payment'],
        );
        expect(Array.from(root.querySelectorAll('.checkout-stepper button'), (item) => item.textContent?.trim())).toEqual(['1', '2', '3']);
        const errors = translations[lang].CUSTOMER.CHECKOUT.SHIPPING.ERRORS;

        enter('phone', lang === 'ar' ? '   ' : '');
        shipping().submit();
        fixture.detectChanges();
        expect(root.querySelector('#phone-error')?.textContent).toContain(errors.PHONE_REQUIRED);
        expect(document.activeElement).toBe(field);
        expect(page.state.canOpenStep('delivery')).toBe(false);

        enter('phone', '+0 123');
        field.dispatchEvent(new Event('blur'));
        fixture.detectChanges();
        expect(root.querySelector('#phone-error')?.textContent).toContain(errors.INVALID_PHONE);
        page.state.goToStep('payment');
        expect(page.state.currentStep()).toBe('shipping');
      }

      enter('phone', ' +٤٤ ٧٧٠٠ ٩٠٠١٢٣ ');
      shipping().submit();
      expect(page.state.currentStep()).toBe('delivery');
      await payment(standard);
      const validShipping = page.state.shippingInformation()!;
      for (const phone of [' ', '+0 123']) {
        page.state.setShippingInformation({ shippingInformation: { ...validShipping, phone }, saveForFuture: false, addressLabel: '' });
        expect(page.state.canPlaceOrder()).toBe(false);
        await page.placeOrder();
        expect(rpc).not.toHaveBeenCalled();
      }

      page.state.setShippingInformation({ shippingInformation: validShipping, saveForFuture: false, addressLabel: '' });
      await page.placeOrder();
      expect(rpc).toHaveBeenCalledExactlyOnceWith('place_customer_order', expect.objectContaining({
        p_shipping_address: expect.objectContaining({ phone: internationalPhone }),
      }));
      expect(page.state.currentStep()).toBe('confirmation');
    });
  }

  it('retains a legacy shipping draft with a missing phone for correction', async () => {
    const { fixture, shipping, fill } = await renderCheckout();
    await fill();
    shipping().submit();
    const key = 'nestora_checkout_shipping_v1';
    const oldDraft = JSON.parse(sessionStorage.getItem(key)!) as { shippingInformation: { phone: string | null } };
    oldDraft.shippingInformation.phone = null;
    sessionStorage.setItem(key, JSON.stringify(oldDraft));
    fixture.destroy();

    const restored = TestBed.createComponent(CustomerCheckoutComponent);
    restored.detectChanges();
    await restored.whenStable();
    expect(restored.componentInstance.state.shippingInformation()?.streetAddress).toBe('Main Street');
    expect(restored.componentInstance.state.canOpenStep('delivery')).toBe(false);
  });

  for (const method of [standard, pickup]) {
    it('places a guest variant order using ' + method.name, async () => {
      const { page, shipping, fill, payment, rpc, fixture } = await renderCheckout();
      await fill();
      shipping().submit();
      expect(page.state.currentStep()).toBe('delivery');

      page.selectShippingMethod(method === standard ? pickup.id : standard.id);
      await payment(method);
      expect(page.state.totals().total).toBe(18 + method.baseCost);
      await page.placeOrder();
      expect(page.state.currentStep()).toBe('confirmation');
      expect(rpc).toHaveBeenCalledExactlyOnceWith('place_customer_order', expect.objectContaining({
        p_cart_id: null, p_payment_method_id: cod.id, p_shipping_method_id: method.id,
        p_discount_code: 'SAVE', p_items: [{ product_id: 'product', variant_id: 'variant', quantity: 1 }],
        p_shipping_address: expect.objectContaining({
          phone: internationalPhone, country: 'Lebanon', street_address: 'Main Street',
        }),
      }));

      const refreshed = TestBed.createComponent(CustomerCheckoutComponent);
      refreshed.detectChanges();
      await refreshed.whenStable();
      expect(refreshed.componentInstance.state.currentStep()).toBe('shipping');
      expect(refreshed.componentInstance.state.hasShippingInformation()).toBe(false);
      fixture.destroy();
    });
  }

  for (const authenticated of [false, true]) {
    it('restores confirmed shipping and places a simple-product order after refresh (' +
      (authenticated ? 'signed in' : 'guest') + ')', async () => {
      const { fixture, page, shipping, fill, payment, rpc } = await renderCheckout(
        authenticated, undefined, undefined, undefined, null,
      );
      await fill();
      shipping().submit();
      await payment(pickup);
      fixture.destroy();

      const refreshed = TestBed.createComponent(CustomerCheckoutComponent);
      refreshed.detectChanges();
      await refreshed.whenStable();
      const restored = refreshed.componentInstance;
      await vi.waitFor(() => expect(restored.state.selectedShippingMethod()?.id).toBe(pickup.id));
      expect(restored.state.currentStep()).toBe('shipping');
      expect(restored.state.shippingInformation()).toEqual(page.state.shippingInformation());
      expect(restored.state.hasShippingInformation()).toBe(true);

      restored.state.goToDelivery();
      restored.state.goToPayment();
      await vi.waitFor(() => expect(restored.state.paymentMethods()).toEqual([cod]));
      expect(restored.state.selectedPaymentMethod()?.id).toBe(cod.id);
      await restored.placeOrder();

      expect(restored.state.currentStep()).toBe('confirmation');
      expect(rpc.mock.calls[0][1]).toMatchObject({
        p_cart_id: authenticated ? 'cart' : null,
        p_shipping_method_id: pickup.id,
        p_items: [{ product_id: 'product', variant_id: null, quantity: 1 }],
        p_shipping_address: { street_address: 'Main Street', city: 'Jounieh', phone: internationalPhone },
      });
      expect(Object.keys(rpc.mock.calls[0][1].p_shipping_address).sort()).toEqual([
        'address_line_2', 'city', 'country', 'delivery_instructions', 'email',
        'first_name', 'last_name', 'phone', 'state_province', 'street_address',
      ]);
    });
  }

  for (const authenticated of [false, true]) {
    it('submits the current mixed cart using ' + (authenticated ? 'the server cart' : 'guest checkout'), async () => {
      const { fixture, page, shipping, fill, payment, rpc, cart } = await renderCheckout(authenticated);
      const simple = { id: 'legacy-simple-line', quantity: 1, product: {
        id: 'duster', variantId: null, name: 'Multi-Head Extendable Duster', price: 5.5,
      } };
      const variant = { id: 'existing-variant-line', quantity: 1, product: {
        id: 'tray', variantId: 'tray-34cm', name: 'GeBe Round Baking Tray', price: 19,
      } };
      cart.set([simple, variant]);
      await fill();
      shipping().submit();
      await payment(standard);
      expect(page.state.subtotal()).toBe(24.5);
      expect(page.state.shippingCost()).toBe(4);

      cart.set([simple, { ...variant, quantity: 2 }]);
      fixture.destroy();
      const refreshed = TestBed.createComponent(CustomerCheckoutComponent);
      refreshed.detectChanges();
      await refreshed.whenStable();
      const checkout = refreshed.componentInstance;
      await vi.waitFor(() => expect(checkout.state.selectedShippingMethod()?.id).toBe(standard.id));
      checkout.state.goToPayment();
      await vi.waitFor(() => expect(checkout.state.selectedPaymentMethod()?.id).toBe(cod.id));
      await checkout.placeOrder();

      expect(checkout.state.currentStep()).toBe('confirmation');
      expect(rpc).toHaveBeenCalledExactlyOnceWith('place_customer_order', expect.objectContaining({
        p_cart_id: authenticated ? 'cart' : null,
        p_expected_subtotal: 43.5,
        p_items: [
          { product_id: 'duster', variant_id: null, quantity: 1 },
          { product_id: 'tray', variant_id: 'tray-34cm', quantity: 2 },
        ],
      }));
    });
  }

  it('keeps a restored address for review when its delivery location is no longer available', async () => {
    const { fixture, shipping, fill, payment, addressAvailable } = await renderCheckout();
    await fill();
    shipping().submit();
    await payment(standard);
    fixture.destroy();

    addressAvailable.mockResolvedValueOnce(false);
    const refreshed = TestBed.createComponent(CustomerCheckoutComponent);
    refreshed.detectChanges();
    await refreshed.whenStable();
    const state = refreshed.componentInstance.state;
    await vi.waitFor(() => expect(state.selectedShippingMethod()?.id).toBe(standard.id));
    expect(addressAvailable).toHaveBeenCalledWith('lb', 'keserwan', 'jounieh');
    expect(state.shippingInformation()?.streetAddress).toBe('Main Street');
    expect(state.canOpenStep('delivery')).toBe(false);
  });

  it('retries a failed request with the same validated shipping data and checkout token', async () => {
    const { page, shipping, fill, payment, rpc } = await renderCheckout();
    await fill();
    shipping().submit();
    await payment(standard);
    rpc.mockRejectedValueOnce(new Error('Network unavailable'));

    await page.placeOrder();
    expect(page.state.currentStep()).toBe('payment');
    expect(page.state.isPlacingOrder()).toBe(false);
    expect(page.state.hasShippingInformation()).toBe(true);

    await page.placeOrder();
    expect(page.state.currentStep()).toBe('confirmation');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);
  });

  it('shows specific errors, keeps the requested field order and preserves the form when going back', async () => {
    const { fixture, page, root, shipping, fill, enter, selectLocation } = await renderCheckout();
    const form = root.querySelector('form')!;
    expect(Array.from(form.querySelectorAll('app-checkout-form-field input, app-searchable-select > button'), (field) => field.id))
      .toEqual(['firstName', 'lastName', 'email', 'phone', 'checkout-location-country', 'checkout-location-province', 'checkout-location-city',
        'streetAddress', 'addressLine2', 'deliveryInstructions']);
    expect(form.classList.contains('grid-cols-2')).toBe(true);
    expect(form.classList.contains('max-sm:grid-cols-1')).toBe(true);
    const country = form.querySelector<HTMLButtonElement>('#checkout-location-country')!;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(country.disabled).toBe(true);
      expect(country.textContent?.trim()).toBe('Lebanon');
    });
    await fill();
    await selectLocation('city', '');
    enter('email', 'wrong');
    shipping().submit();
    fixture.detectChanges();
    expect(page.state.currentStep()).toBe('shipping');
    expect(root.querySelector('#checkout-location-city')?.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('#email-error')?.textContent).toContain('INVALID_EMAIL');

    await fill();
    shipping().submit();
    fixture.detectChanges();
    page.state.goToShipping();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('#checkout-location-city-value')?.textContent?.trim()).toBe('Jounieh');
    });
    await selectLocation('province', 'beirut-region');
    expect(root.querySelector('#checkout-location-city-value')?.textContent?.trim()).toBe('CUSTOMER.LOCATION.choose_city');
    expect(page.state.canOpenStep('delivery')).toBe(false);
    await selectLocation('province', 'keserwan');
    await selectLocation('city', 'jounieh');
    shipping().submit();
    expect(page.state.currentStep()).toBe('delivery');
  });

  it('requires confirmation of a saved address and blocks a second click while auth is pending', async () => {
    const user = deferred<string>();
    const alternate = { ...saved, id: 'office', label: 'Office', streetAddress: 'Office street', country: 'LB' };
    const { page, fixture, root, shipping, payment, rpc } = await renderCheckout(
      true, async () => [saved, alternate], () => user.promise,
    );
    await vi.waitFor(() => expect(page.state.selectedAddressId()).toBe(saved.id));
    fixture.detectChanges();
    expect(page.state.canOpenStep('delivery')).toBe(false);
    root.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[1].click();
    fixture.detectChanges();
    expect(shipping().form.controls.streetAddress.value).toBe('Office street');
    expect(shipping().form.controls.phone.value).toBe(alternate.phone);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('#checkout-location-city-value')?.textContent?.trim()).toBe('Beirut');
    });
    shipping().submit();
    await payment(standard);
    const first = page.placeOrder();
    const second = page.placeOrder();
    expect(page.state.isPlacingOrder()).toBe(true);
    user.resolve('customer');
    await Promise.all([first, second]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_cart_id: 'cart', p_shipping_address: { street_address: 'Office street', country: 'Lebanon' },
    });
    expect(page.state.confirmation()?.order.loyaltyPointsEarned).toBe(3);
  });

  it('keeps typed contact information when the profile arrives and saves a new address', async () => {
    const profile = deferred<{ full_name: string }>();
    const { fixture, page, shipping, fill, enter, payment, createAddress } = await renderCheckout(
      true, async () => [saved], async () => 'customer', () => profile.promise,
    );
    shipping().chooseNewAddress();
    await fill();
    profile.resolve({ full_name: 'Account Customer' });
    await vi.waitFor(() => expect(page.state.shippingPrefill()?.firstName).toBe('Account'));
    fixture.detectChanges();
    expect(shipping().form.controls.firstName.value).toBe('  Guest  ');
    expect(shipping().form.controls.email.value).toBe('buyer@example.com');
    expect(page.state.selectedAddressId()).toBeNull();

    shipping().saveForFuture.setValue(true);
    enter('phone', '');
    shipping().submit();
    expect(shipping().error('phone')).toContain('REQUIRED');
    expect(page.state.currentStep()).toBe('shipping');

    enter('phone', '70123456');
    shipping().submit();
    await payment(standard);
    await page.placeOrder();
    expect(createAddress).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      fullName: 'Guest Customer', phone: '70123456', country: 'Lebanon',
      countryId: 'lb', provinceId: 'keserwan', cityId: 'jounieh',
    }));
    expect(page.state.currentStep()).toBe('confirmation');
  });

  it('keeps entered and submitted shipping details when saved addresses arrive later', async () => {
    const addressLoad = deferred<readonly CustomerAddress[]>();
    const { fixture, page, shipping, fill, payment, rpc } = await renderCheckout(true, () => addressLoad.promise);
    await fill();
    shipping().submit();
    await payment(pickup);
    addressLoad.resolve([saved]);
    await fixture.whenStable();
    expect(page.state.selectedAddressId()).toBeNull();
    expect(page.state.shippingInformation()?.streetAddress).toBe('Main Street');
    await page.placeOrder();
    expect(rpc.mock.calls[0][1].p_shipping_address).toMatchObject({ street_address: 'Main Street' });
  });
  it('clears the selected address and continues checkout after deleting the last card', async () => {
    const { fixture, root, page, shipping, fill, payment, rpc, removeAddress, toast } = await renderCheckout(true);
    await vi.waitFor(() => expect(page.state.selectedAddressId()).toBe(saved.id));
    fixture.detectChanges();
    const trash = root.querySelector<HTMLButtonElement>('.saved-address button[title]')!;
    trash.click();
    fixture.detectChanges();
    expect(page.state.selectedAddressId()).toBe(saved.id);
    const confirm = root.querySelector<HTMLButtonElement>('[role="dialog"] footer button:last-child')!;
    confirm.click();
    await vi.waitFor(() => expect(page.state.selectedAddressId()).toBeNull());
    fixture.detectChanges();
    expect(removeAddress).toHaveBeenCalledWith(saved.id);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(root.querySelector('.saved-address')).toBeNull();
    expect(page.state.canOpenStep('delivery')).toBe(false);
    expect(shipping().form.controls.streetAddress.value).toBe('');

    await fill();
    shipping().submit();
    await payment(standard);
    await page.placeOrder();
    expect(rpc.mock.calls[0][1].p_shipping_address.street_address).toBe('Main Street');
    expect(page.state.currentStep()).toBe('confirmation');
  });

  it('keeps the original selection when cancelling or when the delete fails', async () => {
    const other = { ...saved, id: 'office', label: 'Office', isDefault: false };
    const { fixture, root, page, removeAddress, toast } = await renderCheckout(true, async () => [saved, other]);
    await vi.waitFor(() => expect(page.state.selectedAddressId()).toBe(saved.id));
    fixture.detectChanges();
    const trash = () => root.querySelectorAll<HTMLButtonElement>('.saved-address button[title]')[1];
    trash().click();
    fixture.detectChanges();
    expect(page.state.selectedAddressId()).toBe(saved.id);
    root.querySelector<HTMLButtonElement>('[role="dialog"] footer button:first-child')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(removeAddress).not.toHaveBeenCalled();

    removeAddress.mockRejectedValueOnce(new Error('network'));
    trash().click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[role="dialog"] footer button:last-child')!.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(root.querySelectorAll('.saved-address')).toHaveLength(2);
    expect(page.state.selectedAddressId()).toBe(saved.id);
  });

});
