import { Injectable, inject } from '@angular/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { CustomerShoppingStateService } from '../../services';
import {
  CheckoutOrderItem,
  PlaceCustomerOrderRpcArgs,
  PlacedOrderResult,
} from '../models';
import { CustomerCheckoutStateService } from './customer-checkout-state.service';

interface PlaceCustomerOrderRpcResultRow {
  order_id?: unknown;
  order_number?: unknown;
  status?: unknown;
  payment_status?: unknown;
  subtotal?: unknown;
  shipping_cost?: unknown;
  payment_fee?: unknown;
  discount_amount?: unknown;
  total?: unknown;
}

@Injectable({ providedIn: 'root' })
export class CustomerCheckoutOrderService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  private readonly state = inject(CustomerCheckoutStateService);
  private readonly shopping = inject(CustomerShoppingStateService);

  async placeOrder(
    cartId: string | null,
    items: readonly CheckoutOrderItem[],
    customerNotes: string | null = null,
  ): Promise<PlacedOrderResult> {
    const shippingInformation = this.state.shippingInformation();
    const shippingMethod = this.state.selectedShippingMethod();
    const paymentMethod = this.state.selectedPaymentMethod();
    const customerUserId = await this.auth.getCurrentUserId();
    const resolvedCartId = customerUserId ? cartId : null;

    if (customerUserId && !resolvedCartId?.trim()) {
      throw new Error('A customer cart is required for signed-in checkout.');
    }
    if (!items.length) throw new Error('Your cart is empty.');
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new Error('Every order quantity must be a positive integer.');
    }
    if (!shippingInformation) throw new Error('Shipping information is required.');
    if (!shippingMethod) throw new Error('A shipping method is required.');
    if (!paymentMethod) throw new Error('A payment method is required.');
    if (this.state.isPlacingOrder()) throw new Error('Your order is already being submitted.');

    const rpcArgs: PlaceCustomerOrderRpcArgs = {
      p_cart_id: resolvedCartId,
      p_shipping_method_id: shippingMethod.id,
      p_payment_method_id: paymentMethod.id,
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
      const result = this.mapResult(rawResult);
      this.state.setPlacedOrder(result);
      this.state.goToConfirmation();
      this.shopping.clearCompletedCart();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to place your order.';
      this.state.setPlaceOrderError(message);
      throw new Error(message);
    } finally {
      this.state.setPlacingOrder(false);
    }
  }

  private mapResult(value: unknown): PlacedOrderResult {
    if (!value || typeof value !== 'object') {
      throw new Error('The order service returned an invalid response.');
    }

    const row = value as PlaceCustomerOrderRpcResultRow;
    if (typeof row.order_id !== 'string' || typeof row.order_number !== 'string') {
      throw new Error('The order service did not return an order ID and order number.');
    }

    return {
      orderId: row.order_id,
      orderNumber: row.order_number,
      status: this.toString(row.status, 'pending'),
      paymentStatus: this.toString(row.payment_status, 'pending'),
      subtotal: this.toNumber(row.subtotal),
      shippingCost: this.toNumber(row.shipping_cost),
      paymentFee: this.toNumber(row.payment_fee),
      discountAmount: this.toNumber(row.discount_amount),
      total: this.toNumber(row.total),
    };
  }

  private toString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private toNumber(value: unknown): number {
    const result = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(result)) {
      throw new Error('The order service returned an invalid total.');
    }
    return result;
  }
}
