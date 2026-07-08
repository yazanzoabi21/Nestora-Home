import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { TranslationService } from '../../../../core/services/translation';
import { AuthService } from '../../../../core/services/auth';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  readonly authMode = signal<AuthMode>('login');
  readonly passwordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly translation = inject(TranslationService);
  private readonly translate = inject(TranslateService);
  private readonly authService = inject(AuthService);

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
    this.translation.currentLang();
  }

  setMode(mode: AuthMode): void {
    this.authMode.set(mode);
    this.errorMessage.set(null);
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

      await this.authService.login({
        email,
        password,
      });
    } catch {
      this.errorMessage.set(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
    } finally {
      this.loading.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    try {
      this.loading.set(true);
      this.errorMessage.set(null);

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

      await this.authService.register({
        fullName,
        email,
        phone,
        password,
      });

      this.authMode.set('login');
    } catch {
      this.errorMessage.set(this.t('AUTH.ERRORS.REGISTER_FAILED'));
    } finally {
      this.loading.set(false);
    }
  }
}
