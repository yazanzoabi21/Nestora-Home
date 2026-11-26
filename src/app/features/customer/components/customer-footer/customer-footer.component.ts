import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CUSTOMER_HELP_LINKS, CUSTOMER_SOCIAL_LINKS } from '../../config/customer-contact.config';
import { CustomerNewsletterService } from '../../services/customer-newsletter.service';

@Component({
  selector: 'app-customer-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ReactiveFormsModule],
  templateUrl: './customer-footer.component.html',
  styleUrl: './customer-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFooterComponent {
  private readonly newsletter = inject(CustomerNewsletterService);

  readonly helpLinks = CUSTOMER_HELP_LINKS;
  readonly socialLinks = CUSTOMER_SOCIAL_LINKS;
  readonly email = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.email,
      Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
      Validators.maxLength(254),
    ],
  });
  readonly newsletterForm = new FormGroup({ email: this.email });
  readonly submitting = signal(false);
  readonly status = signal<'idle' | 'success' | 'error'>('idle');

  async subscribe(): Promise<void> {
    if (this.submitting()) return;

    this.email.setValue(this.email.value.trim());
    this.email.markAsTouched();
    this.status.set('idle');
    if (this.email.invalid) return;

    this.submitting.set(true);
    this.email.disable();
    try {
      await this.newsletter.subscribe(this.email.value);
      this.email.reset();
      this.status.set('success');
    } catch {
      this.status.set('error');
    } finally {
      this.email.enable();
      this.submitting.set(false);
    }
  }
}
