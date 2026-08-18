import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { TranslationService } from '../../../../core/services/translation/translation.service';
import { CUSTOMER_SOCIAL_LINKS } from '../../config/customer-contact.config';
import { CustomerHelpHeaderComponent } from '../../components/customer-help-header/customer-help-header.component';
import { CustomerContactMessageInput } from '../../models';
import { CustomerContentService } from '../../services';

type ContactForm = FormGroup<{
  fullName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  subject: FormControl<string>;
  message: FormControl<string>;
}>;

type ContactControlName = keyof ContactForm['controls'];
type ContactFeedback = 'success' | 'error' | null;

@Component({
  selector: 'app-customer-contact',
  standalone: true,
  imports: [CustomerHelpHeaderComponent, ReactiveFormsModule, TranslatePipe],
  templateUrl: './customer-contact.component.html',
  styleUrl: './customer-contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerContactComponent {
  private readonly contentService = inject(CustomerContentService);
  private readonly appTranslation = inject(TranslationService);
  private readonly translate = inject(TranslateService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private submitted = false;

  readonly socialLinks = CUSTOMER_SOCIAL_LINKS;
  readonly sending = signal(false);
  readonly feedback = signal<ContactFeedback>(null);
  readonly form: ContactForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    subject: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(5000)],
    }),
  });

  constructor() {
    effect(() => {
      this.appTranslation.currentLang();
      this.title.setTitle(this.translate.instant('CUSTOMERS.CONTACT.META_TITLE'));
      this.meta.updateTag({
        name: 'description',
        content: this.translate.instant('CUSTOMERS.CONTACT.META_DESCRIPTION'),
      });
    });
  }

  fieldError(name: ContactControlName): string {
    const control = this.form.controls[name];
    if (!control.invalid || (!control.touched && !this.submitted)) return '';

    if (control.hasError('email')) {
      return this.translate.instant('CUSTOMERS.CONTACT.FORM.INVALID_EMAIL');
    }
    if (control.hasError('maxlength')) {
      return this.translate.instant('CUSTOMERS.CONTACT.FORM.MAX_LENGTH');
    }
    return this.translate.instant('CUSTOMERS.CONTACT.FORM.REQUIRED');
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.feedback.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.sending()) return;

    const value = this.form.getRawValue();
    const input: CustomerContactMessageInput = {
      fullName: value.fullName,
      email: value.email,
      phone: value.phone.trim() || null,
      subject: value.subject,
      message: value.message,
    };

    this.sending.set(true);
    try {
      await this.contentService.submitContactMessage(input);
      this.form.reset();
      this.submitted = false;
      this.feedback.set('success');
    } catch (error) {
      console.error('Unable to submit customer contact message.', error);
      this.feedback.set('error');
    } finally {
      this.sending.set(false);
    }
  }
}
