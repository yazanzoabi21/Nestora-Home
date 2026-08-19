import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  buildCustomerWhatsAppUrl,
  CUSTOMER_WHATSAPP_CONTACT,
} from '../../config/customer-contact.config';

@Component({
  selector: 'app-whatsapp-contact',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './whatsapp-contact.component.html',
  styleUrl: './whatsapp-contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsAppContactComponent {
  private readonly translate = inject(TranslateService);
  private readonly translatedDefaultMessage = toSignal(
    this.translate.stream(CUSTOMER_WHATSAPP_CONTACT.messageKey),
    { initialValue: CUSTOMER_WHATSAPP_CONTACT.defaultMessage },
  );

  readonly phoneNumber = input(CUSTOMER_WHATSAPP_CONTACT.phoneNumber);
  readonly message = input<string | null>(null);

  readonly labelKey = CUSTOMER_WHATSAPP_CONTACT.labelKey;
  readonly ariaLabelKey = CUSTOMER_WHATSAPP_CONTACT.ariaLabelKey;
  readonly whatsappUrl = computed(() =>
    buildCustomerWhatsAppUrl(
      this.phoneNumber(),
      this.message()?.trim() || this.translatedDefaultMessage(),
    ),
  );
}
