import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { TranslationService } from '../../../../core/services/translation';
import {
  AdminAuthService,
  CustomerAuthService,
  getCustomerSignupErrorMessage,
} from '../../../../core/services/auth';
import { CustomerShoppingStateService } from '../../../customer/services';

type AuthMode = 'login' | 'register';
type AuthAudience = 'admin' | 'customer';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly audience: AuthAudience;
  readonly authMode: ReturnType<typeof signal<AuthMode>>;
  readonly passwordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  private readonly translation = inject(TranslationService);
  private readonly translate = inject(TranslateService);
  private readonly adminAuth = inject(AdminAuthService);
  private readonly customerAuth = inject(CustomerAuthService);
  private readonly shopping = inject(CustomerShoppingStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loginForm = {
    email: '',
    password: '',
  };

  registerForm = {
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  };

  constructor() {
    this.audience = this.route.snapshot.data['audience'] as AuthAudience ?? 'admin';
    this.authMode = signal<AuthMode>(this.route.snapshot.data['initialMode'] as AuthMode ?? 'login');
    this.translation.currentLang();
  }

  setMode(mode: AuthMode): void {
    if (this.audience === 'customer') {
      void this.router.navigate([mode === 'register' ? '/auth/customer-register' : '/auth/customer-login']);
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  toggleConfirmPasswordVisibility(): void {
    this.confirmPasswordVisible.update((visible) => !visible);
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async submitLogin(): Promise<void> {
    try {
      this.loading.set(true);
      this.errorMessage.set(null);

      const email = this.loginForm.email.trim();
      const password = this.loginForm.password;

      if (!email) {
        this.errorMessage.set(this.t('AUTH.ERRORS.EMAIL_REQUIRED'));
        return;
      }

      if (!this.isValidEmail(email)) {
        this.errorMessage.set(this.t('AUTH.ERRORS.EMAIL_INVALID'));
        return;
      }

      if (!password) {
        this.errorMessage.set(this.t('AUTH.ERRORS.PASSWORD_REQUIRED'));
        return;
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const request = { email, password };
      if (this.audience === 'customer') {
        await this.customerAuth.login(request, returnUrl);
      } else {
        await this.adminAuth.login(request, returnUrl);
      }
      await this.shopping.initialize();
    } catch {
      this.errorMessage.set(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
    } finally {
      this.loading.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);

      const fullName = this.registerForm.fullName.trim();
      const email = this.registerForm.email.trim();
      const phone = this.registerForm.phone.trim();
      const password = this.registerForm.password;
      const confirmPassword = this.registerForm.confirmPassword;

      if (!fullName) {
        this.errorMessage.set(this.t('AUTH.ERRORS.FULL_NAME_REQUIRED'));
        return;
      }

      if (!email) {
        this.errorMessage.set(this.t('AUTH.ERRORS.EMAIL_REQUIRED'));
        return;
      }

      if (!this.isValidEmail(email)) {
        this.errorMessage.set(this.t('AUTH.ERRORS.EMAIL_INVALID'));
        return;
      }

      if (!phone) {
        this.errorMessage.set(this.t('AUTH.ERRORS.PHONE_REQUIRED'));
        return;
      }

      if (!password) {
        this.errorMessage.set(this.t('AUTH.ERRORS.PASSWORD_REQUIRED'));
        return;
      }

      if (password.length < 6) {
        this.errorMessage.set(this.t('AUTH.ERRORS.PASSWORD_MIN_LENGTH', { min: 6 }));
        return;
      }

      if (!confirmPassword) {
        this.errorMessage.set(this.t('AUTH.ERRORS.CONFIRM_PASSWORD_REQUIRED'));
        return;
      }

      if (password !== confirmPassword) {
        this.errorMessage.set(this.t('AUTH.ERRORS.PASSWORDS_NOT_MATCH'));
        return;
      }

      const result = await this.customerAuth.register({
        fullName,
        email,
        phone,
        password,
      });

      this.registerForm.password = '';
      this.registerForm.confirmPassword = '';

      if (result.status === 'confirmation-required') {
        this.successMessage.set('Account created. Check your email to confirm your account.');
        return;
      }

      await this.shopping.initialize();
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      if (returnUrl?.startsWith('/shop') && !returnUrl.startsWith('//')) {
        await this.router.navigateByUrl(returnUrl);
      } else {
        await this.router.navigate(['/shop/customer-account']);
      }
    } catch (error) {
      this.errorMessage.set(getCustomerSignupErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
