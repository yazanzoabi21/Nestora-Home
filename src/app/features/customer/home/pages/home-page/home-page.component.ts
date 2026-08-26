import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
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
import { CustomerRecentlyViewedComponent } from '../../../components/customer-recently-viewed';
import { CustomerProduct } from '../../../models';
import { CustomerOrdersService } from '../../../orders';
import {
  CustomerShoppingStateService,
  CustomerRecentlyViewedService,
  CustomerReviewsService,
  CustomerCatalogService,
} from '../../../services';
import { CustomerFlashDeals } from '../components/customer-flash-deals/customer-flash-deals/customer-flash-deals';

interface HomeBenefit {
  icon: string;
  titleKey: string;
  textKey: string;
}

type RecentlyViewedStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CustomerFlashDeals,
    CustomerProductCardComponent,
    CustomerProductCardSkeleton,
    CustomerProductQuickViewComponent,
    CustomerRecentlyViewedComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly productsService = inject(CustomerCatalogService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly promotionsService = inject(PromotionsService);
  private readonly reviewsService = inject(CustomerReviewsService);
  private readonly recentlyViewedService = inject(CustomerRecentlyViewedService);
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
  readonly recentlyViewedProducts = signal<readonly CustomerProduct[]>([]);
  readonly recentlyViewedStatus = signal<RecentlyViewedStatus>('idle');
  readonly recentlyViewedClearing = signal(false);
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
  // Preserved for possible restoration with the hidden Customer Reviews homepage section.
  // readonly featuredReviews = computed(() =>
  //   this.reviews()
  //     .filter((review) => review.status === 'published' && !!review.comment)
  //     .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
  //     .slice(0, 3),
  // );
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

  private recentlyViewedRequestId = 0;
  private recentlyViewedLoadKey: string | null = null;
  private recentlyViewedPendingLoadKey: string | null = null;

  constructor() {
    effect(() => {
      const products = this.productsService.productsSnapshot();
      if (!products) return;

      untracked(() => {
        this.products.set([...products]);
        const productsById = new Map(products.map((product) => [product.id, product]));
        this.recentlyViewedProducts.update((recent) =>
          recent.flatMap((product) => {
            const updated = productsById.get(product.id);
            return updated ? [updated] : [];
          }),
        );

        const selectedProductId = this.selectedProduct()?.id;
        if (selectedProductId) {
          this.selectedProduct.set(productsById.get(selectedProductId) ?? null);
        }
      });
    });
    effect(() => {
      const authLoading = this.auth.isLoading();
      const isAuthenticated = this.auth.isAuthenticated();
      if (!authLoading) void this.loadCompletedOrderCount(isAuthenticated);
    });
    effect(() => {
      const authLoading = this.auth.isLoading();
      const sessionUserId = this.auth.session()?.user.id ?? null;
      const revision = this.recentlyViewedService.revision();

      if (authLoading) {
        this.recentlyViewedStatus.set('idle');
        return;
      }

      const loadKey = `${sessionUserId ?? 'guest'}:${revision}`;
      if (
        loadKey === this.recentlyViewedLoadKey ||
        loadKey === this.recentlyViewedPendingLoadKey
      ) {
        return;
      }

      // Keep loader UI reads/writes out of this effect's auth/revision dependencies.
      untracked(() => {
        void this.loadRecentlyViewed(loadKey, revision);
      });
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

  // Preserved for possible restoration with the hidden Customer Reviews homepage section.
  // reviewName(review: Review): string {
  //   return review.customer?.full_name?.trim() || 'Nestora customer';
  // }
  //
  // reviewInitials(review: Review): string {
  //   return this.reviewName(review)
  //     .split(/\s+/)
  //     .slice(0, 2)
  //     .map((part) => part[0])
  //     .join('')
  //     .toUpperCase();
  // }

  async clearRecentlyViewed(): Promise<void> {
    if (this.recentlyViewedClearing()) return;

    this.recentlyViewedClearing.set(true);
    try {
      await this.recentlyViewedService.clearHistory();
      this.recentlyViewedRequestId += 1;
      this.recentlyViewedProducts.set([]);
      this.recentlyViewedStatus.set('empty');
    } catch (error) {
      console.warn('Unable to clear recently viewed history.', error);
      this.toast.error(this.translate.instant('CUSTOMER.HOME.RECENTLY_VIEWED.CLEAR_FAILED'));
    } finally {
      this.recentlyViewedClearing.set(false);
    }
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

    if (/^https?:\/\//i.test(actionLink) && typeof window !== 'undefined') {
      const opened = window.open(actionLink, '_blank', 'noopener,noreferrer');
      if (opened) opened.opener = null;
      return;
    }

    await this.router.navigateByUrl(actionLink);
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
        categories
          .filter(
            (category) =>
              category.is_active !== false &&
              category.parent_id !== null &&
              category.parent_id !== undefined,
          )
          .slice(0, 4),
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

  private async loadRecentlyViewed(
    pendingLoadKey: string,
    revision: number,
  ): Promise<void> {
    const requestId = ++this.recentlyViewedRequestId;
    this.recentlyViewedPendingLoadKey = pendingLoadKey;
    const hasResolvedProducts =
      this.recentlyViewedStatus() === 'ready' && this.recentlyViewedProducts().length > 0;
    if (!hasResolvedProducts) {
      this.recentlyViewedStatus.set('loading');
    }

    try {
      const snapshot = await this.recentlyViewedService.getRecentlyViewedSnapshot();
      if (requestId === this.recentlyViewedRequestId) {
        const resolvedLoadKey = `${snapshot.userId ?? 'guest'}:${revision}`;

        this.recentlyViewedLoadKey = resolvedLoadKey;
        if (!this.sameProducts(this.recentlyViewedProducts(), snapshot.products)) {
          this.recentlyViewedProducts.set(snapshot.products);
        }
        this.recentlyViewedStatus.set(snapshot.products.length > 0 ? 'ready' : 'empty');
      }
    } catch (error) {
      console.warn('Unable to load recently viewed products.', error);
      if (requestId === this.recentlyViewedRequestId) {
        this.recentlyViewedProducts.set([]);
        this.recentlyViewedStatus.set('error');
      }
    } finally {
      if (this.recentlyViewedPendingLoadKey === pendingLoadKey) {
        this.recentlyViewedPendingLoadKey = null;
      }
    }
  }

  private sameProducts(
    current: readonly CustomerProduct[],
    incoming: readonly CustomerProduct[],
  ): boolean {
    if (current.length !== incoming.length) return false;

    return current.every((product, index) => {
      const next = incoming[index];
      return (
        next !== undefined &&
        product.id === next.id &&
        product.name === next.name &&
        product.brand === next.brand &&
        product.category === next.category &&
        product.imageUrl === next.imageUrl &&
        product.description === next.description &&
        product.price === next.price &&
        product.originalPrice === next.originalPrice &&
        product.rating === next.rating &&
        product.reviewCount === next.reviewCount &&
        product.discountPercentage === next.discountPercentage &&
        product.badge === next.badge &&
        product.isFeatured === next.isFeatured &&
        product.isNew === next.isNew &&
        product.isActive === next.isActive &&
        product.soldCount === next.soldCount &&
        product.inStock === next.inStock &&
        product.stock === next.stock &&
        product.createdAt === next.createdAt &&
        product.slug === next.slug
      );
    });
  }

  private isArabic(): boolean {
    return this.currentLanguage().toLowerCase().startsWith('ar');
  }

  private offerActionLink(offer: CustomerOffer): string | null {
    const actionLink = offer.action_link?.trim() ?? '';
    return actionLink.length > 0 ? actionLink : null;
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
