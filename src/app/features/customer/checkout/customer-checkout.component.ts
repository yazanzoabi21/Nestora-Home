import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CheckoutConfirmationComponent } from './checkout-confirmation/checkout-confirmation.component';
import { CheckoutDeliveryComponent } from './checkout-delivery/checkout-delivery.component';
import { CheckoutOrderSummaryComponent } from './checkout-order-summary/checkout-order-summary.component';
import { CheckoutPaymentComponent } from './checkout-payment/checkout-payment.component';
import { CheckoutShippingComponent } from './checkout-shipping/checkout-shipping.component';
import { CheckoutStepperComponent } from './checkout-stepper/checkout-stepper.component';
import { CheckoutStep } from './checkout.models';
import { CustomerCheckoutStateService } from './customer-checkout-state.service';

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

  readonly completedSteps = computed(() => {
    const completed = new Set<CheckoutStep>();
    if (this.state.shippingInfo()) completed.add('shipping');
    if (
      this.state.shippingInfo() &&
      this.state.selectedDelivery() &&
      (this.state.currentStep() === 'payment' || this.state.confirmation())
    ) {
      completed.add('delivery');
    }
    if (this.state.confirmation()) completed.add('payment');
    return completed;
  });

  readonly canOpenStep = (step: CheckoutStep): boolean => this.state.canOpenStep(step);

  async ngOnInit(): Promise<void> {
    if (await this.state.requireCheckoutAccess()) {
      await this.state.initialize();
    }
  }
}
