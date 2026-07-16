import { Injectable, inject } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { CustomerShoppingStateService } from '../../services';
import { CheckoutOrderItem, PlaceCustomerOrderRpcArgs, PlacedOrderResult } from '../models';
import { CustomerCheckoutStateService } from './customer-checkout-state.service';

interface PlaceCustomerOrderRpcResultRow {
  order_id?: unknown;
  order_number?: unknown;
  status?: unknown;
  payment_status?: unknown;
  subtotal?: unknown;
  shipping_cost?: unknown;
  payment_fee?: unknown;
  discount_id?: unknown;
  discount_code?: unknown;
  discount_amount?: unknown;
  total?: unknown;
}

@Injectable({ providedIn: 'root' })
export class CustomerCheckoutOrderService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  private readonly state = inject(CustomerCheckoutStateService);
  private readonly shopping = inject(CustomerShoppingStateService);
  private checkoutToken = uuidv4();

  async placeOrder(
    cartId: string | null,
    items: readonly CheckoutOrderItem[],
    customerNotes: string | null = null,
  ): Promise<PlacedOrderResult> {
    const shippingInformation = this.state.shippingInformation();
    const shippingMethod = this.state.selectedShippingMethod();
    const paymentMethod = this.state.selectedPaymentMethod();
    const appliedDiscount = this.shopping.appliedDiscount();
    const customerUserId = await this.auth.getCurrentUserId();
    const resolvedCartId = customerUserId ? cartId : null;

    if (customerUserId && !resolvedCartId?.trim()) {
      throw new Error('A customer cart is required for signed-in checkout.');
    }
    if (!items.length) throw new Error('Your cart is empty.');
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new Error('Every order quantity must be a positive integer.');
    }
    if (
      items.some(
        (item) =>
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice < 0 ||
          !Number.isFinite(item.lineTotal) ||
          item.lineTotal < 0 ||
          Math.abs(item.lineTotal - item.unitPrice * item.quantity) > 0.01,
      )
    ) {
      throw new Error('Every checkout item must contain a valid price.');
    }
    if (!shippingInformation) throw new Error('Shipping information is required.');
    if (!shippingMethod) throw new Error('A shipping method is required.');
    if (!paymentMethod) throw new Error('A payment method is required.');
    if (this.state.isPlacingOrder()) throw new Error('Your order is already being submitted.');

    const rpcArgs: PlaceCustomerOrderRpcArgs = {
      p_checkout_token: this.checkoutToken,
      p_cart_id: resolvedCartId,
      p_shipping_method_id: shippingMethod.id,
      p_payment_method_id: paymentMethod.id,
      p_discount_id: appliedDiscount?.id ?? null,
      p_discount_code: appliedDiscount?.code ?? null,
      p_expected_subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      p_shipping_address: {
        first_name: shippingInformation.firstName,
        last_name: shippingInformation.lastName,
        email: shippingInformation.email,
        phone: shippingInformation.phone,
        street_address: shippingInformation.streetAddress,
        address_line_2: shippingInformation.addressLine2,
        city: shippingInformation.city,
        state_province: shippingInformation.stateProvince,
        postal_code: shippingInformation.postalCode,
        country: shippingInformation.country,
        delivery_instructions: shippingInformation.deliveryInstructions,
      },
      p_items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      p_customer_notes: customerNotes?.trim() || null,
    };

    this.state.setPlacingOrder(true);
    this.state.setPlaceOrderError(null);

    try {
      const { data, error } = await this.supabase.rpc('place_customer_order', rpcArgs);
      if (error) throw new Error(error.message);

      const rawResult: unknown = Array.isArray(data) ? data[0] : data;
      const result = this.mapResult(rawResult, items);
      this.state.setPlacedOrder(result);
      this.state.goToConfirmation();
      this.shopping.clearCompletedCart();
      this.checkoutToken = uuidv4();
      return result;
    } catch (error) {
      const message = this.friendlyOrderError(error);
      this.state.setPlaceOrderError(message);
      throw new Error(message, { cause: error });
    } finally {
      this.state.setPlacingOrder(false);
    }
  }

  private friendlyOrderError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';

    if (/insufficient stock|only \d+ units?|out of stock/i.test(message)) {
      return message;
    }
    if (/pricing changed/i.test(message)) {
      return 'A product price changed. Please return to your cart and review the updated total.';
    }
    if (/not available|inactive/i.test(message)) {
      return 'One of your selections is no longer available. Please return to your cart and review it.';
    }

    return message || 'Unable to place your order. Please try again.';
  }

  private mapResult(value: unknown, items: readonly CheckoutOrderItem[]): PlacedOrderResult {
    if (!value || typeof value !== 'object') {
      throw new Error('The order service returned an invalid response.');
    }

    const row = value as PlaceCustomerOrderRpcResultRow;
    if (typeof row.order_id !== 'string' || typeof row.order_number !== 'string') {
      throw new Error('The order service did not return an order ID and order number.');
    }

    const result: PlacedOrderResult = {
      orderId: row.order_id,
      orderNumber: row.order_number,
      status: this.toString(row.status, 'pending'),
      paymentStatus: this.toString(row.payment_status, 'pending'),
      subtotal: this.toMoney(row.subtotal, 'subtotal'),
      shippingCost: this.toMoney(row.shipping_cost, 'shipping cost'),
      paymentFee: this.toMoney(row.payment_fee, 'payment fee'),
      discountAmount: this.toMoney(row.discount_amount, 'discount amount'),
      discountCode: this.toNullableString(row.discount_code),
      discountId: this.toNullableString(row.discount_id),
      total: this.toMoney(row.total, 'total'),
    };

    const itemSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isFinite(itemSubtotal) || itemSubtotal < 0) {
      throw new Error('The checkout items contain an invalid price.');
    }

    if (Math.abs(result.subtotal - itemSubtotal) > 0.01) {
      throw new Error('The persisted order subtotal does not match the checkout items.');
    }

    if (result.discountAmount - result.subtotal > 0.01) {
      throw new Error('The order service returned an invalid discount amount.');
    }

    const calculatedTotal = Math.max(
      0,
      result.subtotal + result.shippingCost + result.paymentFee - result.discountAmount,
    );
    if (Math.abs(result.total - calculatedTotal) > 0.01) {
      throw new Error('The order service returned inconsistent totals.');
    }

    return result;
  }

  private toString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private toMoney(value: unknown, field: string): number {
    const result = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(result) || result < 0) {
      throw new Error(`The order service returned an invalid ${field}.`);
    }
    return result;
  }
}
