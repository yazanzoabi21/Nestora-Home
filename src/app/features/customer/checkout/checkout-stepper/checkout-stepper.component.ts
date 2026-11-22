import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

import { CheckoutStep } from '../models';

interface CheckoutStepperItem {
  id: CheckoutStep;
  labelKey: string;
  number: number;
}

@Component({
  selector: 'app-checkout-stepper',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './checkout-stepper.component.html',
  styleUrl: './checkout-stepper.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutStepperComponent {
  readonly active = input.required<CheckoutStep>();
  readonly completed = input.required<Set<CheckoutStep>>();
  readonly canOpenStep = input.required<(step: CheckoutStep) => boolean>();
  readonly stepClick = output<CheckoutStep>();

  readonly steps: CheckoutStepperItem[] = [
    { id: 'shipping', labelKey: 'CUSTOMER.CHECKOUT.STEPS.SHIPPING', number: 1 },
    { id: 'delivery', labelKey: 'CUSTOMER.CHECKOUT.STEPS.DELIVERY', number: 2 },
    { id: 'payment', labelKey: 'CUSTOMER.CHECKOUT.STEPS.PAYMENT', number: 3 },
  ];

  isComplete(step: CheckoutStep): boolean {
    return this.completed().has(step);
  }

  canOpen(step: CheckoutStep): boolean {
    return this.canOpenStep()(step);
  }
}
