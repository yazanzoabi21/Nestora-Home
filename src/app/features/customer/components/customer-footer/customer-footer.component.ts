import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CUSTOMER_HELP_LINKS, CUSTOMER_SOCIAL_LINKS } from '../../config/customer-contact.config';

@Component({
  selector: 'app-customer-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './customer-footer.component.html',
  styleUrl: './customer-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFooterComponent {
  readonly helpLinks = CUSTOMER_HELP_LINKS;
  readonly socialLinks = CUSTOMER_SOCIAL_LINKS;
}
