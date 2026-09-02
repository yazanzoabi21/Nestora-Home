import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

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

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.completeSignIn();
  }

  private async completeSignIn(): Promise<void> {
    try {
      const oauthError =
        this.route.snapshot.queryParamMap.get('error_description') ??
        this.route.snapshot.queryParamMap.get('error');
      const returnUrl = await this.auth.completeGoogleSignIn(oauthError);
      await this.shopping.initialize();
      await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    } catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Unable to complete Google sign-in.',
      );
    }
  }
}
