import { TestBed } from '@angular/core/testing';
import { CustomerAuthService } from '../../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { CustomerAddressesService, CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../../services';
import { CustomerCheckoutOrderService } from './customer-checkout-order.service';
import { CustomerCheckoutStateService } from './customer-checkout-state.service';

describe('CustomerCheckoutOrderService automatic confirmation', () => {
  for (const userId of [null, 'owned-customer']) {
    it(`finishes ${userId ? 'authenticated' : 'guest'} checkout without a verification endpoint or customer action`, async () => {
      const invoke = vi.fn();
      const rpc = vi.fn().mockResolvedValue({ data: {
        order_id: 'owned-order', order_number: 'OWNED-TEST', subtotal: 10,
        shipping_cost: 0, payment_fee: 0, discount_amount: 0, total: 10,
      }, error: null });
      const confirmation = vi.fn();
      TestBed.configureTestingModule({ providers: [
        CustomerCheckoutOrderService,
        { provide: CUSTOMER_SUPABASE, useValue: { rpc, functions: { invoke } } },
        { provide: CustomerAuthService, useValue: { getCurrentUserId: async () => userId } },
        { provide: CustomerShoppingStateService, useValue: { appliedDiscount: () => null, clearCompletedCart: vi.fn() } },
        { provide: LoyaltyPointsCalculatorService, useValue: { clearRedemptions: vi.fn(), refreshBalance: async () => undefined } },
        { provide: CustomerAddressesService, useValue: {} },
        { provide: CustomerCheckoutStateService, useValue: {
          shippingInformation: () => ({ firstName: 'Owned', lastName: 'Test', email: 'info@nestorahomelb.com',
            streetAddress: 'Owned test', city: 'Test', stateProvince: 'Test', country: 'Lebanon' }),
          selectedShippingMethod: () => ({ id: 'shipping' }), selectedPaymentMethod: () => ({ id: 'payment' }),
          hasShippingInformation: () => true, placedOrder: () => null,
          saveAddressForFuture: () => false, isPlacingOrder: () => false, setPlacingOrder: vi.fn(), setPlaceOrderError: vi.fn(),
          setPlacedOrder: vi.fn(), goToConfirmation: confirmation,
        } },
      ] });
      const service = TestBed.inject(CustomerCheckoutOrderService);
      const result = await service.placeOrder(userId ? 'owned-cart' : null, [{
        productId: 'owned-product', variantId: null, variantLabel: null, productName: 'Test product',
        productImageUrl: null, quantity: 1, unitPrice: 10, originalUnitPrice: 10, lineTotal: 10,
        isFreeGift: false, appliedDiscountCode: null, redeemWithPoints: false, loyaltyPointsCost: 0,
      }]);
      expect(result.orderId).toBe('owned-order');
      expect(confirmation).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledOnce();
      expect(rpc.mock.calls[0][0]).toBe('place_customer_order');
      expect(invoke).not.toHaveBeenCalled();
    });
  }
});
