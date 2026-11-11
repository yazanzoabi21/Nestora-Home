import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../../core/services';
import {
  CUSTOMER_PASSWORD_MIN_LENGTH,
  CustomerAuthService,
} from '../../../../core/services/auth';
import { CustomerAuthShellComponent } from '../../components/customer-auth-shell';

type RecoveryState = 'checking' | 'ready' | 'invalid';

const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
};

@Component({
  selector: 'app-customer-reset-password',
  standalone: true,
  imports: [CustomerAuthShellComponent, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-reset-password.component.html',
  styleUrl: './customer-reset-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerResetPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly passwordMinLength = CUSTOMER_PASSWORD_MIN_LENGTH;
  readonly form = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(CUSTOMER_PASSWORD_MIN_LENGTH)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );
  readonly recoveryState = signal<RecoveryState>('checking');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly passwordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.validateRecoverySession();
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get confirmPasswordControl() {
    return this.form.controls.confirmPassword;
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  toggleConfirmPasswordVisibility(): void {
    this.confirmPasswordVisible.update((visible) => !visible);
  }

  async submit(): Promise<void> {
    if (this.loading() || this.recoveryState() !== 'ready') return;

    this.submitted.set(true);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.updatePasswordFromRecovery(this.passwordControl.value);
      this.toast.success(this.translate.instant('AUTH.PASSWORD_RESET.PASSWORD_UPDATED'));
      await this.router.navigate(['/auth/customer-login'], { replaceUrl: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes('invalid or has expired')) {
        this.recoveryState.set('invalid');
      } else {
        this.errorMessage.set(this.translate.instant('AUTH.PASSWORD_RESET.UPDATE_FAILED'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async validateRecoverySession(): Promise<void> {
    try {
      const session = await this.auth.waitForPasswordRecoverySession();
      this.recoveryState.set(session ? 'ready' : 'invalid');
    } catch {
      this.recoveryState.set('invalid');
    }
  }
}
