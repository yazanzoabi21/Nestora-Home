import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Category, Discount } from '../../../../data-access/models';
import { CategoriesService, DiscountsService } from '../../../../data-access/services';
import { CustomerShoppingStateService } from '../../services';
import { CustomerAuthService } from '../../../../core/services/auth';

interface CustomerNavLink {
  label: string;
  path: string;
}

@Component({
  selector: 'app-customer-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './customer-navbar.component.html',
  styleUrl: './customer-navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerNavbarComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  readonly categoriesMenuOpen = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly navbarCategories = signal<Category[]>([]);
  readonly promotionalMessages = signal<string[]>([]);
  readonly navLinks: CustomerNavLink[] = [
    { label: 'All Products', path: '/shop/products' },
    { label: 'New Arrivals', path: '/shop/new-arrivals' },
  ];
  readonly customerAuth = inject(CustomerAuthService);
  readonly accountDestination = computed(() => this.customerAuth.isAuthenticated() ? '/shop/customer-account' : '/auth/customer-login');
  readonly accountAriaLabel = computed(() => this.customerAuth.isLoading() ? 'Restoring customer session' : this.customerAuth.isAuthenticated() ? 'Open customer account' : 'Sign in to customer account');
  readonly customerInitials = computed(() => this.customerAuth.isAuthenticated() ? this.customerAuth.initials() : 'N');

  private readonly categoriesService = inject(CategoriesService);
  private readonly discountsService = inject(DiscountsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);

  constructor() {
    void this.loadCategories();
    void this.loadPromotionalMessages();
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.closeCategoriesMenu();
        this.closeMobileMenu();
      });
  }

  toggleCategoriesMenu(): void {
    this.categoriesMenuOpen.update((open) => !open);
  }

  async openAccount(): Promise<void> {
    if (this.customerAuth.isLoading()) return;
    await this.router.navigateByUrl(this.accountDestination());
  }

  closeCategoriesMenu(): void {
    this.categoriesMenuOpen.set(false);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
    this.closeCategoriesMenu();
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  categoryIconClass(category: Category): string {
    return this.isIconValue(category.image_url) ? category.image_url ?? 'pi pi-tag' : 'pi pi-tag';
  }

  categoryImageUrl(category: Category): string | null {
    return category.image_url && !this.isIconValue(category.image_url) ? category.image_url : null;
  }

  @HostListener('document:click', ['$event'])
  closeMenuOnOutsideClick(event: MouseEvent): void {
    if (this.categoriesMenuOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeCategoriesMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeMenuOnEscape(): void {
    this.closeCategoriesMenu();
    this.closeMobileMenu();
  }

  private async loadCategories(): Promise<void> {
    try {
      this.navbarCategories.set(await this.categoriesService.getCategories());
    } catch {
      this.navbarCategories.set([]);
    }
  }

  private async loadPromotionalMessages(): Promise<void> {
    try {
      const discounts = await this.discountsService.getDiscounts();
      this.promotionalMessages.set(
        discounts
          .filter(
            (discount) =>
              this.discountsService.getDiscountStatus(discount) === 'active' &&
              (discount.usage_limit === null || discount.usage_count < discount.usage_limit),
          )
          .map((discount) => this.formatPromotionalMessage(discount)),
      );
    } catch {
      this.promotionalMessages.set([]);
    }
  }

  private formatPromotionalMessage(discount: Discount): string {
    const minimum = this.minimumOrderLabel(discount.minimum_order_amount);

    switch (discount.discount_type) {
      case 'free_shipping':
        return `FREE SHIPPING${minimum} · USE CODE: ${discount.code}`;
      case 'percentage':
        return `USE CODE: ${discount.code} FOR ${this.formatNumber(discount.discount_value)}% OFF${minimum}`;
      case 'fixed_amount':
        return `USE CODE: ${discount.code} FOR ${this.formatCurrency(discount.discount_value)} OFF${minimum}`;
    }
  }

  private minimumOrderLabel(value: number | null): string {
    return value && value > 0 ? ` ON ORDERS OVER ${this.formatCurrency(value)}` : '';
  }

  private formatCurrency(value: number | null): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Number.isInteger(value ?? 0) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value ?? 0);
  }

  private formatNumber(value: number | null): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value ?? 0);
  }

  private isIconValue(value: string | null | undefined): boolean {
    return !!value && (value.startsWith('pi ') || value.startsWith('fa ') || value.startsWith('fa-'));
  }
}
