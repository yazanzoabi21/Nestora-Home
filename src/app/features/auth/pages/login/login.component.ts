import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

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

  async submitLogin(): Promise<void> {
    try {
      this.loading.set(true);
      this.errorMessage.set(null);

      await this.authService.login({
        email: this.loginForm.email,
        password: this.loginForm.password,
      });
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Login failed.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    try {
      this.loading.set(true);
      this.errorMessage.set(null);

      if (this.registerForm.password !== this.registerForm.confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      await this.authService.register({
        fullName: this.registerForm.fullName,
        email: this.registerForm.email,
        phone: this.registerForm.phone,
        password: this.registerForm.password,
      });

      this.authMode.set('login');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Registration failed.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
