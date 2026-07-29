import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../../../../core/services';
import { CustomerAuthService } from '../../../../../core/services/auth';
import { TranslationService } from '../../../../../core/services/translation';
import { Category, CustomerOffer, Promotion, Review } from '../../../../../data-access/models';
import {
  CategoriesService,
  CustomerOffersService,
  PromotionsService,
} from '../../../../../data-access/services';
import { CustomerProductCardComponent } from '../../../components/customer-product-card';
import { CustomerProductCardSkeleton } from '../../../components/customer-product-card-skeleton/customer-product-card-skeleton';
import {
  CustomerProductAddRequest,
  CustomerProductQuickViewComponent,
} from '../../../components/customer-product-quick-view';
import { CustomerProduct } from '../../../models';
import { CustomerOrdersService } from '../../../orders';
import {
  CustomerShoppingStateService,
  CustomerReviewsService,
  NewArrivalsService,
} from '../../../services';
import { CustomerFlashDeals } from '../components/customer-flash-deals/customer-flash-deals/customer-flash-deals';

interface HomeBenefit {
  icon: string;
  titleKey: string;
  textKey: string;
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CustomerFlashDeals,
    CustomerProductCardComponent,
    CustomerProductCardSkeleton,
    CustomerProductQuickViewComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly productsService = inject(NewArrivalsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly promotionsService = inject(PromotionsService);
  private readonly reviewsService = inject(CustomerReviewsService);
  private readonly offersService = inject(CustomerOffersService);
  private readonly auth = inject(CustomerAuthService);
  private readonly customerOrders = inject(CustomerOrdersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly appTranslation = inject(TranslationService);

  readonly products = signal<CustomerProduct[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly promotions = signal<Promotion[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly offers = signal<CustomerOffer[]>([]);
  readonly completedOrderCount = signal<number | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly selectedProduct = signal<CustomerProduct | null>(null);
  readonly currentLanguage = this.appTranslation.currentLang;

  readonly bestSellers = computed(() =>
    [...this.products()]
      .filter((product) => product.isActive)
      .sort(
        (first, second) =>
          second.soldCount - first.soldCount ||
          second.rating - first.rating ||
          second.reviewCount - first.reviewCount,
      )
      .slice(0, 4),
  );
  readonly newArrivals = computed(() =>
    this.products()
      .filter((product) => product.isNew)
      .slice(0, 4),
  );
  readonly activePromotions = computed(() =>
    this.promotions()
      .filter((promotion) => this.promotionsService.getPromotionStatus(promotion) === 'active')
      .slice(0, 4),
  );
  // readonly flashDeals = computed(() => this.activePromotions().slice(0, 3));
  readonly flashDeals = computed(() =>
    this.activePromotions()
      .filter(
        (promotion) =>
          promotion.placement === 'home_flash_deals' && promotion.display_type === 'banner',
      )
      .sort((first, second) => (first.sort_order ?? 0) - (second.sort_order ?? 0))
      .slice(0, 3),
  );
  readonly seasonalPromotion = computed(
    () =>
      this.activePromotions().find((promotion) => promotion.image_url) ??
      this.activePromotions()[0] ??
      null,
  );
  readonly featuredReviews = computed(() =>
    this.reviews()
      .filter((review) => review.status === 'published' && !!review.comment)
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
      .slice(0, 3),
  );
  readonly visibleOffers = computed(() => {
    const isAuthenticated = this.auth.isAuthenticated();
    const completedOrderCount = this.completedOrderCount();

    return this.offers()
      .filter((offer) => {
        switch (offer.audience) {
          case 'guest':
            return !isAuthenticated;
          case 'customer':
            return isAuthenticated;
          case 'new_customer':
            return !isAuthenticated || completedOrderCount === 0;
          case 'all':
          default:
            return true;
        }
      })
      .slice(0, 4);
  });

  readonly loadingCards = [1, 2, 3, 4];
  readonly benefits: readonly HomeBenefit[] = [
    {
      icon: 'pi-truck',
      titleKey: 'CUSTOMER.HOME.BENEFITS.SHIPPING',
      textKey: 'CUSTOMER.HOME.BENEFITS.SHIPPING_TEXT',
    },
    {
      icon: 'pi-replay',
      titleKey: 'CUSTOMER.HOME.BENEFITS.RETURNS',
      textKey: 'CUSTOMER.HOME.BENEFITS.RETURNS_TEXT',
    },
    {
      icon: 'pi-shield',
      titleKey: 'CUSTOMER.HOME.BENEFITS.QUALITY',
      textKey: 'CUSTOMER.HOME.BENEFITS.QUALITY_TEXT',
    },
    {
      icon: 'pi-headphones',
      titleKey: 'CUSTOMER.HOME.BENEFITS.SUPPORT',
      textKey: 'CUSTOMER.HOME.BENEFITS.SUPPORT_TEXT',
    },
  ];
  readonly difference = [
    {
      icon: '🏆',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.PREMIUM.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.PREMIUM.TEXT',
    },
    {
      icon: '🌿',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.ECO.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.ECO.TEXT',
    },
    {
      icon: '💡',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SMART.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SMART.TEXT',
    },
    {
      icon: '🚚',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.DELIVERY.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.DELIVERY.TEXT',
    },
    {
      icon: '🤝',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SUPPORT.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SUPPORT.TEXT',
    },
    {
      icon: '✨',
      titleKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SATISFACTION.TITLE',
      textKey: 'CUSTOMER.HOME.DIFFERENCE.ITEMS.SATISFACTION.TEXT',
    },
  ] as const;
  constructor() {
    effect(() => {
      const authLoading = this.auth.isLoading();
      const isAuthenticated = this.auth.isAuthenticated();
      if (!authLoading) void this.loadCompletedOrderCount(isAuthenticated);
    });
    void this.loadHome();
  }

  async retry(): Promise<void> {
    await this.loadHome();
  }

  async addToCart(product: CustomerProduct, quantity = 1): Promise<void> {
    await this.shopping.addToCart(product, quantity);
  }

  async toggleWishlist(product: CustomerProduct): Promise<void> {
    await this.shopping.toggleWishlist(product);
  }

  openQuickView(product: CustomerProduct): void {
    this.selectedProduct.set(product);
  }

  closeQuickView(): void {
    this.selectedProduct.set(null);
  }

  async addFromQuickView(request: CustomerProductAddRequest): Promise<void> {
    await this.addToCart(request.product, request.quantity);
  }

  reviewName(review: Review): string {
    return review.customer?.full_name?.trim() || 'Nestora customer';
  }

  reviewInitials(review: Review): string {
    return this.reviewName(review)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  promotionLink(promotion: Promotion): string {
    return promotion.button_link?.startsWith('/shop') ? promotion.button_link : '/shop/products';
  }

  offerTitle(offer: CustomerOffer): string {
    return this.isArabic() ? offer.title_ar : offer.title_en;
  }

  offerDescription(offer: CustomerOffer): string {
    return (this.isArabic() ? offer.description_ar : offer.description_en) ?? '';
  }

  offerBadge(offer: CustomerOffer): string {
    return (this.isArabic() ? offer.badge_ar : offer.badge_en) ?? '';
  }

  offerActionText(offer: CustomerOffer): string {
    return (this.isArabic() ? offer.action_text_ar : offer.action_text_en) ?? '';
  }

  hasValidOfferAction(offer: CustomerOffer): boolean {
    return this.offerActionLink(offer) !== null;
  }

  async openOfferAction(offer: CustomerOffer): Promise<void> {
    const actionLink = this.offerActionLink(offer);
    if (!actionLink) return;

    if (actionLink.startsWith('/')) {
      await this.router.navigateByUrl(actionLink);
      return;
    }

    if (typeof window !== 'undefined') {
      const opened = window.open(actionLink, '_blank', 'noopener,noreferrer');
      if (opened) opened.opener = null;
    }
  }

  async copyDiscountCode(event: MouseEvent, code: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const normalizedCode = code.trim();
    if (!normalizedCode) return;

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard API is unavailable.');
      }
      await navigator.clipboard.writeText(normalizedCode);
      this.toast.success(this.translate.instant('CUSTOMER.HOME.OFFERS.COPY_SUCCESS'));
    } catch (error) {
      this.toast.error(
        this.translate.instant('CUSTOMER.HOME.OFFERS.COPY_FAILED'),
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  private async loadHome(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [products, categories, promotions, reviews, offers] = await Promise.all([
        this.productsService.getProducts(),
        this.categoriesService.getCategoriesWithProductCount(),
        this.promotionsService.getPromotions(),
        this.reviewsService.getPublishedReviews(3),
        this.offersService.getActiveCustomerOffers(),
      ]);
      this.products.set(products);
      this.categories.set(
        categories.filter((category) => category.is_active !== false).slice(0, 4),
      );
      this.promotions.set(promotions);
      this.reviews.set(reviews);
      this.offers.set(offers);
    } catch (error) {
      console.error('Unable to load customer home data.', error);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCompletedOrderCount(isAuthenticated: boolean): Promise<void> {
    if (!isAuthenticated) {
      this.completedOrderCount.set(null);
      return;
    }

    try {
      const orders = await this.customerOrders.getCustomerOrders();
      this.completedOrderCount.set(
        orders.filter((order) => order.status === 'completed' || order.status === 'delivered')
          .length,
      );
    } catch (error) {
      console.warn('Unable to determine completed customer orders for offer targeting.', error);
      this.completedOrderCount.set(null);
    }
  }

  private isArabic(): boolean {
    return this.currentLanguage().toLowerCase().startsWith('ar');
  }

  private isValidActionLink(value: string): boolean {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private offerActionLink(offer: CustomerOffer): string | null {
    const recommendedLinks: Readonly<Record<string, string | null>> = {
      'welcome-first-order': '/shop/products',
      'refer-a-friend': null,
      'app-exclusive': null,
      'loyalty-points': null,
    };

    if (offer.slug in recommendedLinks) {
      return recommendedLinks[offer.slug] ?? null;
    }

    const actionLink = offer.action_link?.trim() ?? '';
    return actionLink && this.isValidActionLink(actionLink) ? actionLink : null;
  }

  categoryIcon(slug: string | null | undefined): string {
    const icons: Record<string, string> = {
      'kitchen-tools': 'pi pi-home',
      cookware: 'pi pi-sun',
      'cleaning-tools': 'pi pi-sparkles',
      'magick-touch': 'pi pi-bolt',
      'magic-touch': 'pi pi-bolt',
      'smart-tools': 'pi pi-mobile',
      gebe: 'pi pi-star',
    };

    return icons[slug?.toLowerCase() ?? ''] ?? 'pi pi-box';
  }
}
