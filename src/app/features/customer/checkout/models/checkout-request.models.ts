export interface PlaceCustomerOrderItemRequest {
  product_id: string;
  quantity: number;
}

export interface PlaceCustomerOrderShippingRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  street_address: string;
  address_line_2: string | null;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  delivery_instructions: string | null;
}

export interface PlaceCustomerOrderRequest {
  cart_id: string | null;
  shipping_method_id: string;
  payment_method_id: string;
  shipping_address: PlaceCustomerOrderShippingRequest;
  items: readonly PlaceCustomerOrderItemRequest[];
  customer_notes: string | null;
}

export interface PlaceCustomerOrderRpcArgs {
  p_cart_id: string | null;
  p_shipping_method_id: string;
  p_payment_method_id: string;
  p_shipping_address: PlaceCustomerOrderShippingRequest;
  p_items: readonly PlaceCustomerOrderItemRequest[];
  p_customer_notes: string | null;
}
