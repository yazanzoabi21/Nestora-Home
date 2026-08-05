import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CheckoutConfirmationComponent } from './checkout-confirmation/checkout-confirmation.component';
import { CheckoutDeliveryComponent } from './checkout-delivery/checkout-delivery.component';
import { CheckoutOrderSummaryComponent } from './checkout-order-summary/checkout-order-summary.component';
import { CheckoutPaymentComponent } from './checkout-payment/checkout-payment.component';
import { CheckoutShippingComponent } from './checkout-shipping/checkout-shipping.component';
import { CheckoutStepperComponent } from './checkout-stepper/checkout-stepper.component';
import { CheckoutShippingSubmission, CheckoutStep } from './models';
import { CustomerCheckoutOrderService, CustomerCheckoutStateService } from './services';

@Component({
  selector: 'app-customer-checkout',
  standalone: true,
  imports: [
    RouterLink,
    CheckoutConfirmationComponent,
    CheckoutDeliveryComponent,
    CheckoutOrderSummaryComponent,
    CheckoutPaymentComponent,
    CheckoutShippingComponent,
    CheckoutStepperComponent,
  ],
  providers: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-checkout.component.html',
  styleUrl: './customer-checkout.component.css',
})
export class CustomerCheckoutComponent implements OnInit {
  readonly state = inject(CustomerCheckoutStateService);
  readonly currency = inject(CurrencyPipe);
  private readonly orders = inject(CustomerCheckoutOrderService);

  readonly completedSteps = computed(() => {
    const completed = new Set<CheckoutStep>();
    if (this.state.hasShippingInformation()) completed.add('shipping');
    if (
      this.state.hasShippingInformation() &&
      this.state.hasShippingMethod() &&
      (this.state.currentStep() === 'payment' || this.state.placedOrder())
    ) {
      completed.add('delivery');
    }
    if (this.state.placedOrder()) completed.add('payment');
    return completed;
  });

  readonly canOpenStep = (step: CheckoutStep): boolean => this.state.canOpenStep(step);

  saveShipping(value: CheckoutShippingSubmission): void {
    this.state.setShippingInformation(value);
    this.state.goToDelivery();
  }

  selectSavedAddress(id: string): void {
    this.state.selectSavedAddress(id);
  }

  selectShippingMethod(id: string): void {
    const method = this.state.shippingMethods().find((item) => item.id === id);
    if (method) this.state.selectShippingMethod(method);
  }

  selectPaymentMethod(id: string): void {
    const method = this.state.paymentMethods().find((item) => item.id === id);
    if (method) this.state.selectPaymentMethod(method);
  }

  async placeOrder(): Promise<void> {
    try {
      await this.orders.placeOrder(
        this.state.shopping.checkoutCartId(),
        this.state.checkoutItems(),
      );
    } catch {
      // The order service preserves checkout state and exposes a user-facing error signal.
    }
  }

  async ngOnInit(): Promise<void> {
    if (await this.state.requireCheckoutAccess()) {
      await this.state.initialize();
    }
  }

  private emptyShippingValue() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: '',
    deliveryInstructions: '',
  };
}
}
