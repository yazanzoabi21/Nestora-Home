import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services';
import { CustomerAuthShellComponent } from '../../components/customer-auth-shell';

@Component({
  selector: 'app-customer-forgot-password',
  standalone: true,
  imports: [CustomerAuthShellComponent, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-forgot-password.component.html',
  styleUrl: './customer-forgot-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerForgotPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(CustomerAuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly requestSent = signal(false);
  readonly errorMessage = signal<string | null>(null);

  get emailControl() {
    return this.form.controls.email;
  }

  async submit(): Promise<void> {
    if (this.loading()) return;

    this.submitted.set(true);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.requestPasswordReset(this.emailControl.value);
      this.requestSent.set(true);
      this.toast.success(
        this.translate.instant('AUTH.PASSWORD_RESET.CHECK_EMAIL'),
        this.translate.instant('AUTH.PASSWORD_RESET.NEUTRAL_SUCCESS'),
      );
    } catch {
      this.errorMessage.set(this.translate.instant('AUTH.PASSWORD_RESET.REQUEST_FAILED'));
    } finally {
      this.loading.set(false);
    }
  }
}
