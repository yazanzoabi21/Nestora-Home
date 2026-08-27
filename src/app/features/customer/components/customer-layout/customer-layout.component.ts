import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { CustomerNavbarComponent } from '../customer-navbar/customer-navbar.component';
import { CustomerFooterComponent } from '../customer-footer/customer-footer.component';
import { WhatsAppContactComponent } from '../whatsapp-contact/whatsapp-contact.component';
import { CustomerScrollToTopComponent } from '../customer-scroll-to-top/customer-scroll-to-top.component';

@Component({
  selector: 'app-customer-layout',
  standalone: true,
  host: {
    '[class.customer-layout--cart]': 'cartRouteActive()',
  },
  imports: [
    RouterOutlet,
    CustomerNavbarComponent,
    CustomerFooterComponent,
    WhatsAppContactComponent,
    CustomerScrollToTopComponent,
  ],
  templateUrl: './customer-layout.component.html',
  styleUrl: './customer-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLayoutComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly cartRouteActive = signal(this.isCartRoute(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.cartRouteActive.set(this.isCartRoute(event.urlAfterRedirects)));
  }

  private isCartRoute(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0];
    return path === '/shop/cart' || path === '/shop/cart/';
  }
}
