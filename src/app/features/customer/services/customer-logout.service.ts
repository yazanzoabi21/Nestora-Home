import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';

@Injectable({ providedIn: 'root' })
export class CustomerLogoutService {
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly pending = signal(false);
  readonly isLoggingOut = this.pending.asReadonly();

  async logout(): Promise<boolean> {
    if (this.pending() || !this.auth.isAuthenticated()) return false;
    this.pending.set(true);

    try {
      const result = await this.auth.logout(false);
      if (!result.localSessionCleared || !result.remoteRevocationConfirmed) {
        const key = result.localSessionCleared ? 'AUTH.ERRORS.LOGOUT_UNCONFIRMED' : 'AUTH.ERRORS.LOGOUT_LOCAL_FAILED';
        this.toast.warn(this.translate.instant(key) as string);
      }
      if (!result.localSessionCleared) return false;

      await this.router.navigate(['/shop'], { replaceUrl: true });
      return true;
    } catch {
      this.toast.error(this.translate.instant('AUTH.ERRORS.LOGOUT_LOCAL_FAILED') as string);
      return false;
    } finally {
      this.pending.set(false);
    }
  }
}
