import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export type CustomerPageStateKind = 'loading' | 'error' | 'empty' | 'not-found';

@Component({
  selector: 'app-customer-page-state',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './customer-page-state.component.html',
  styleUrl: './customer-page-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerPageStateComponent {
  readonly kind = input.required<CustomerPageStateKind>();
  readonly titleKey = input.required<string>();
  readonly detailKey = input.required<string>();
  readonly retry = output<void>();
}
