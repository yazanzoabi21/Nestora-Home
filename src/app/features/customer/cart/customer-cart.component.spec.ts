import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import translations from '../../../../assets/i18n/translations.json';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { DiscountsService } from '../../../data-access';
import { CustomerCartLine } from '../models';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../services';
import { CustomerCartComponent } from './customer-cart.component';

const line: CustomerCartLine = {
  id: 'line',
  product: {
    id: 'product', name: 'Product', brand: 'Nestora', category: 'Home', imageUrl: '/image.jpg',
    price: 10, rating: 0, reviewCount: 0, isFeatured: false, isNew: false, isActive: true,
    isLoyaltyEligible: true, soldCount: 0, inStock: true, stock: 3, variantId: 'variant',
  },
  quantity: 1, isFreeGift: false, appliedDiscountId: null, appliedDiscountCode: null,
};

async function renderCart(quantity: number) {
  const cart = signal([{ ...line, quantity }]);
  const authenticated = signal(false);
  const setQuantity = vi.fn(async (_id: string, next: number) => {
    cart.set([{ ...line, quantity: next }]);
  });
  const removeFromCart = vi.fn(async () => cart.set([]));

  TestBed.configureTestingModule({
    imports: [CustomerCartComponent],
    providers: [
      provideRouter([]), provideTranslateService(),
      { provide: CustomerAuthService, useValue: { isAuthenticated: authenticated, isLoading: () => false } },
      { provide: ToastService, useValue: { productRemoved: vi.fn() } },
      { provide: DiscountsService, useValue: { getAutomaticFreeGiftDiscount: async () => null } },
      { provide: CustomerShoppingStateService, useValue: {
        cart, cartQuantity: computed(() => cart()[0]?.quantity ?? 0),
        subtotal: computed(() => (cart()[0]?.quantity ?? 0) * line.product.price),
        discountAmount: () => 0, appliedDiscount: () => null, error: () => null, loading: () => false,
        stockConflicts: () => [], pendingProductIds: signal(new Set<string>()),
        cartLineKey: (item: CustomerCartLine) => item.id, lineKey: (id: string) => id,
        setQuantity, removeFromCart,
      } },
      { provide: LoyaltyPointsCalculatorService, useValue: {
        enabled: () => true, isRedemptionRequested: () => false,
        preview: () => ({ pointsEarned: 5, rewardCost: 20 }),
        estimateOrderPoints: () => 5, balance: () => 12, balanceLoading: () => false,
        clearProductRedemption: vi.fn(),
      } },
    ],
  });

  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en', translations.en);
  translate.setTranslation('ar', translations.ar);
  translate.use('en');
  const fixture = TestBed.createComponent(CustomerCartComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  const element: HTMLElement = fixture.nativeElement;
  const button = (label: string, root: ParentNode = element): HTMLButtonElement => {
    const control = Array.from(root.querySelectorAll('button')).find((item) =>
      (item.getAttribute('aria-label') ?? item.textContent)?.trim() === label,
    );
    if (!control) throw new Error('Missing button ' + label);
    return control;
  };
  return { authenticated, button, cart, element, fixture, removeFromCart, setQuantity, translate };
}

describe('CustomerCartComponent quantity and rewards', () => {
  it('uses the existing confirmed removal at quantity one', async () => {
    const { button, element, fixture, removeFromCart, setQuantity } = await renderCart(1);
    const trash = button(translations.en.CUSTOMER.CART.REMOVE);
    expect(trash.querySelector('.pi-trash')).toBeTruthy();
    trash.click();
    fixture.detectChanges();
    expect(removeFromCart).not.toHaveBeenCalled();
    const dialog = element.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    button(translations.en.CUSTOMER.CART.REMOVE, dialog!).click();
    await fixture.whenStable();
    expect(removeFromCart).toHaveBeenCalledExactlyOnceWith('product', 'variant', false, null);
    expect(setQuantity).not.toHaveBeenCalled();
  });

  it('decrements to one and ignores another click while the update is pending', async () => {
    const { button, cart, fixture, removeFromCart, setQuantity } = await renderCart(2);
    const decrease = button(translations.en.CUSTOMER.CART.DECREASE);
    expect(decrease.querySelector('.pi-minus')).toBeTruthy();
    decrease.click();
    decrease.click();
    await fixture.whenStable();
    expect(setQuantity).toHaveBeenCalledExactlyOnceWith('product', 1, 'variant');
    expect(cart()[0].quantity).toBe(1);
    expect(removeFromCart).not.toHaveBeenCalled();
    expect(button(translations.en.CUSTOMER.CART.REMOVE).querySelector('.pi-trash')).toBeTruthy();
  });

  it('switches Arabic control labels and shows only the rewards for the current session', async () => {
    const { authenticated, button, element, fixture, translate } = await renderCart(1);
    const invitation = () => element.querySelector('#cart-rewards-invitation');
    const summary = () => element.querySelector('#cart-rewards-summary');
    expect(invitation()?.textContent).toContain(translations.en.CUSTOMER.LOYALTY.TITLE);
    expect(element.querySelector('a[href="/auth/customer-login?returnUrl=%2Fshop%2Fcart"]')).toBeTruthy();
    expect(summary()).toBeNull();
    expect(element.querySelector('app-customer-loyalty-points-badge')).toBeNull();

    translate.use('ar');
    fixture.detectChanges();
    expect(button(translations.ar.CUSTOMER.CART.REMOVE)).toBeTruthy();
    expect(invitation()?.textContent).toContain(translations.ar.CUSTOMER.LOYALTY.TITLE);

    authenticated.set(true);
    fixture.detectChanges();
    expect(invitation()).toBeNull();
    expect(summary()?.textContent).toContain(translations.ar.CUSTOMER.LOYALTY.CART_TITLE);
    expect(summary()?.parentElement?.textContent).toContain('12');
    expect(element.querySelector('app-customer-loyalty-points-badge')?.textContent).toContain('5');

    translate.use('en');
    fixture.detectChanges();
    expect(invitation()).toBeNull();
    expect(summary()?.textContent).toContain(translations.en.CUSTOMER.LOYALTY.CART_TITLE);
  });
});
