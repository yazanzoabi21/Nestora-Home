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
import { Category } from '../../../../data-access/models';
import { CategoriesService } from '../../../../data-access/services';
import {
  CustomerPromotionAnnouncement,
  CustomerPromotionalBarService,
  CustomerShoppingStateService,
} from '../../services';
import { CustomerAuthService } from '../../../../core/services/auth';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerLanguageSwitchComponent } from '../customer-language-switch/customer-language-switch.component';

interface CustomerNavLink {
  labelKey: string;
  path: string;
}

const DEFAULT_SHIPPING_DISCOUNT_ANNOUNCEMENT =
  'FREE SHIPPING ON ORDERS OVER $75 · USE CODE: NESTORA10 FOR 10% OFF';

@Component({
  selector: 'app-customer-navbar',
  standalone: true,
  host: {
    class: 'contents',
  },
  imports: [
    CustomerLanguageSwitchComponent,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
  ],
  templateUrl: './customer-navbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerNavbarComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  readonly categoriesMenuOpen = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly navbarCategories = signal<Category[]>([]);
  readonly subCategories = computed(() =>
    this.navbarCategories().filter(
      (category) =>
        category.is_active !== false &&
        category.parent_id !== null &&
        category.parent_id !== undefined,
    ),
  );
  readonly promotionalAnnouncements = signal<CustomerPromotionAnnouncement[]>([]);
  readonly discountAnnouncements = signal<CustomerPromotionAnnouncement[]>([]);
  readonly announcementsLoading = signal(true);
  readonly activeAnnouncementIndex = signal(0);
  readonly announcementVisible = signal(true);
  readonly activeAnnouncement = computed(() => {
    const announcements = this.promotionalAnnouncements();
    return announcements.length > 0
      ? announcements[this.activeAnnouncementIndex() % announcements.length]
      : null;
  });
  readonly shippingDiscountAnnouncement = computed(
    () =>
      this.discountAnnouncements()[0]?.shippingText ??
      DEFAULT_SHIPPING_DISCOUNT_ANNOUNCEMENT,
  );
  readonly navLinks: CustomerNavLink[] = [
    { labelKey: 'CUSTOMER.PRODUCTS.ALL_PRODUCTS', path: '/shop/products' },
    { labelKey: 'CUSTOMER.PRODUCTS.NEW_ARRIVALS', path: '/shop/new-arrivals' },
  ];
  readonly customerAuth = inject(CustomerAuthService);
  readonly accountDestination = computed(() => this.customerAuth.isAuthenticated() ? '/shop/customer-account' : '/auth/customer-login');
  readonly accountAriaLabel = computed(() => this.customerAuth.isLoading() ? 'Restoring customer session' : this.customerAuth.isAuthenticated() ? 'Open customer account' : 'Sign in to customer account');
  readonly customerInitials = computed(() => this.customerAuth.isAuthenticated() ? this.customerAuth.initials() : 'N');

  private readonly categoriesService = inject(CategoriesService);
  private readonly promotionalBarService = inject(CustomerPromotionalBarService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private announcementRotationId: ReturnType<typeof setInterval> | null = null;
  private announcementFadeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.loadCategories();
    void this.loadPromotionalAnnouncements();
    this.destroyRef.onDestroy(() => this.stopAnnouncementRotation());
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

  pauseAnnouncementCarousel(): void {
    this.stopAnnouncementRotation();
  }

  resumeAnnouncementCarousel(): void {
    this.startAnnouncementRotation();
  }

  selectAnnouncement(index: number): void {
    if (index === this.activeAnnouncementIndex()) {
      this.startAnnouncementRotation();
      return;
    }

    this.showAnnouncement(index);
    this.startAnnouncementRotation();
  }

  categoryIconClass(category: Category): string {
    const icon = category.icon?.trim();

    if (!icon || !this.isIconValue(icon)) {
      return 'pi pi-tag';
    }

    return icon;
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
      const categories = await this.categoriesService.getCategories();

      this.navbarCategories.set(
        categories.filter(
          (category) =>
            category.is_active === true &&
            category.parent_id !== null &&
            category.parent_id !== undefined,
        )
      );
    } catch {
      this.navbarCategories.set([]);
    }
  }

  private async loadPromotionalAnnouncements(): Promise<void> {
    this.announcementsLoading.set(true);
    try {
      const [promotions, discounts] = await Promise.all([
        this.promotionalBarService.getActivePromotionAnnouncements(),
        this.promotionalBarService.getActiveDiscountAnnouncements(),
      ]);
      this.promotionalAnnouncements.set([...promotions, ...discounts]);
      this.discountAnnouncements.set(discounts);
      this.activeAnnouncementIndex.set(0);
      this.startAnnouncementRotation();
    } catch {
      this.promotionalAnnouncements.set([]);
      this.discountAnnouncements.set([]);
    } finally {
      this.announcementsLoading.set(false);
    }
  }

  private startAnnouncementRotation(): void {
    this.clearAnnouncementInterval();
    if (this.promotionalAnnouncements().length < 2) return;

    this.announcementRotationId = setInterval(() => {
      const nextIndex = (this.activeAnnouncementIndex() + 1) % this.promotionalAnnouncements().length;
      this.showAnnouncement(nextIndex);
    }, 3000);
  }

  private stopAnnouncementRotation(): void {
    this.clearAnnouncementInterval();
    if (this.announcementFadeTimeoutId !== null) {
      clearTimeout(this.announcementFadeTimeoutId);
      this.announcementFadeTimeoutId = null;
    }

    this.announcementVisible.set(true);
  }

  private clearAnnouncementInterval(): void {
    if (this.announcementRotationId === null) return;

    clearInterval(this.announcementRotationId);
    this.announcementRotationId = null;
  }

  private showAnnouncement(index: number): void {
    this.announcementVisible.set(false);

    if (this.announcementFadeTimeoutId !== null) {
      clearTimeout(this.announcementFadeTimeoutId);
    }

    this.announcementFadeTimeoutId = setTimeout(() => {
      this.activeAnnouncementIndex.set(index);
      this.announcementVisible.set(true);
      this.announcementFadeTimeoutId = null;
    }, 150);
  }

  private isIconValue(
    value: string | null | undefined,
  ): value is string {
    return !!value &&
      (
        value.startsWith('pi ') ||
        value.startsWith('fa ') ||
        value.startsWith('fa-')
      );
  }
}
