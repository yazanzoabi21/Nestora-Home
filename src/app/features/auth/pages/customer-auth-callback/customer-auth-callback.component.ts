import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CustomerShoppingStateService } from '../../../customer/services';

@Component({
  selector: 'app-customer-auth-callback',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './customer-auth-callback.component.html',
  styleUrl: './customer-auth-callback.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAuthCallbackComponent {
  private readonly auth = inject(CustomerAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shopping = inject(CustomerShoppingStateService);
  private readonly translate = inject(TranslateService);

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.completeSignIn();
  }

  private async completeSignIn(): Promise<void> {
    try {
      const oauthError =
        this.route.snapshot.queryParamMap.get('error_description') ??
        this.route.snapshot.queryParamMap.get('error');
      if (oauthError !== null) {
        // An invalid callback must not enter failed-login cleanup and log out a
        // different active session or cancel its unrelated pending flows.
        this.errorMessage.set(this.translate.instant('AUTH.ERRORS.GOOGLE_SIGN_IN_FAILED'));
        return;
      }
      const returnUrl = await this.auth.completeGoogleSignIn();
      await this.shopping.initialize();
      await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    } catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Unable to complete Google sign-in.',
      );
    }
  }
}
