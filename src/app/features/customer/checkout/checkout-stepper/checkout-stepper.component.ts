import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CheckoutStep } from '../models';

interface CheckoutStepperItem {
  id: CheckoutStep;
  label: string;
  number: number;
}

@Component({
  selector: 'app-checkout-stepper',
  standalone: true,
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
    { id: 'shipping', label: 'Shipping', number: 1 },
    { id: 'delivery', label: 'Delivery', number: 2 },
    { id: 'payment', label: 'Payment', number: 3 },
  ];

  isComplete(step: CheckoutStep): boolean {
    return this.completed().has(step);
  }

  canOpen(step: CheckoutStep): boolean {
    return this.canOpenStep()(step);
  }
}
