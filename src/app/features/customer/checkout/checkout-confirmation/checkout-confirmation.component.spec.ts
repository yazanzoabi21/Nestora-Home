import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { CustomerAuthService } from '../../../../core/services/auth';
import { CheckoutConfirmation } from '../models';
import { CheckoutConfirmationComponent } from './checkout-confirmation.component';

describe('CheckoutConfirmationComponent without order-email OTP', () => {
  for (const authenticated of [false, true]) {
    it(`preserves ${authenticated ? 'customer' : 'guest'} success details/navigation without verification controls`, async () => {
      TestBed.configureTestingModule({ imports: [CheckoutConfirmationComponent], providers: [
        provideRouter([]), provideTranslateService({ lang: 'en' }),
        { provide: CustomerAuthService, useValue: { isAuthenticated: () => authenticated } },
      ] });
      const message = 'Your order has been placed successfully. A confirmation email will be sent to your email address.';
      TestBed.inject(TranslateService).setTranslation('en', { CUSTOMER: { CHECKOUT: { CONFIRMATION: { MESSAGE: message } } } });
      const confirmation: CheckoutConfirmation = {
        order: { orderId: 'owned-order', orderNumber: 'OWNED-ORDER-123', status: 'pending', paymentStatus: 'unpaid',
          subtotal: 10, shippingCost: 0, paymentFee: 0, discountAmount: 0, discountCode: null,
          discountId: null, total: 10, loyaltyPointsRedeemed: 0, loyaltyPointsEarned: 0 },
        customerName: 'Owned test', paymentMethodName: 'Cash on delivery', items: [],
        totals: { subtotal: 10, shippingCost: 0, paymentFee: 0, discountAmount: 0, discountCode: null, total: 10 },
      };
      const fixture = TestBed.createComponent(CheckoutConfirmationComponent);
      fixture.componentRef.setInput('confirmation', confirmation);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain(message);
      expect(element.textContent).toContain('OWNED-ORDER-123');
      expect(element.textContent).toContain('Cash on delivery');
      expect(element.querySelector('app-order-email-verification, input, form')).toBeNull();
      expect(element.querySelector('a[href="/shop"]') !== null).toBe(!authenticated);
      expect(element.querySelector('a[href="/shop/customer-account/orders"]') !== null).toBe(authenticated);
    });
  }
});
