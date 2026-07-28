import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Category, Promotion, Review } from '../../../../../data-access/models';
import { CategoriesService, PromotionsService } from '../../../../../data-access/services';
import { CustomerProductCardComponent } from '../../../components/customer-product-card';
import { CustomerProductCardSkeleton } from '../../../components/customer-product-card-skeleton/customer-product-card-skeleton';
import {
  CustomerProductAddRequest,
  CustomerProductQuickViewComponent,
} from '../../../components/customer-product-quick-view';
import { CustomerProduct } from '../../../models';
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

interface HomeOffer {
  icon: string;
  titleKey: string;
  textKey: string;
  actionKey: string;
  tone: string;
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

  readonly products = signal<CustomerProduct[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly promotions = signal<Promotion[]>([]);
  readonly reviews = signal<Review[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly selectedProduct = signal<CustomerProduct | null>(null);

  readonly bestSellers = computed(() =>
    [...this.products()]
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
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
          promotion.placement === 'home_flash_deals' &&
          promotion.display_type === 'banner',
      )
      .sort(
        (first, second) =>
          (first.sort_order ?? 0) - (second.sort_order ?? 0),
      )
      .slice(0, 3),
  );
  readonly seasonalPromotion = computed(() =>
    this.activePromotions().find((promotion) => promotion.image_url) ?? this.activePromotions()[0] ?? null,
  );
  readonly featuredReviews = computed(() =>
    this.reviews()
      .filter((review) => review.status === 'published' && !!review.comment)
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
      .slice(0, 3),
  );

  readonly loadingCards = [1, 2, 3, 4];
  readonly benefits: readonly HomeBenefit[] = [
    { icon: 'pi-truck', titleKey: 'CUSTOMER.HOME.BENEFITS.SHIPPING', textKey: 'CUSTOMER.HOME.BENEFITS.SHIPPING_TEXT' },
    { icon: 'pi-replay', titleKey: 'CUSTOMER.HOME.BENEFITS.RETURNS', textKey: 'CUSTOMER.HOME.BENEFITS.RETURNS_TEXT' },
    { icon: 'pi-shield', titleKey: 'CUSTOMER.HOME.BENEFITS.QUALITY', textKey: 'CUSTOMER.HOME.BENEFITS.QUALITY_TEXT' },
    { icon: 'pi-headphones', titleKey: 'CUSTOMER.HOME.BENEFITS.SUPPORT', textKey: 'CUSTOMER.HOME.BENEFITS.SUPPORT_TEXT' },
  ];
  readonly difference: readonly HomeBenefit[] = [
    { icon: 'pi-star-fill', titleKey: 'CUSTOMER.HOME.DIFFERENCE.CURATION', textKey: 'CUSTOMER.HOME.DIFFERENCE.CURATION_TEXT' },
    { icon: 'pi-sun', titleKey: 'CUSTOMER.HOME.DIFFERENCE.ECO', textKey: 'CUSTOMER.HOME.DIFFERENCE.ECO_TEXT' },
    { icon: 'pi-lightbulb', titleKey: 'CUSTOMER.HOME.DIFFERENCE.DESIGN', textKey: 'CUSTOMER.HOME.DIFFERENCE.DESIGN_TEXT' },
    { icon: 'pi-truck', titleKey: 'CUSTOMER.HOME.DIFFERENCE.DELIVERY', textKey: 'CUSTOMER.HOME.DIFFERENCE.DELIVERY_TEXT' },
    { icon: 'pi-users', titleKey: 'CUSTOMER.HOME.DIFFERENCE.EXPERTS', textKey: 'CUSTOMER.HOME.DIFFERENCE.EXPERTS_TEXT' },
    { icon: 'pi-sparkles', titleKey: 'CUSTOMER.HOME.DIFFERENCE.SATISFACTION', textKey: 'CUSTOMER.HOME.DIFFERENCE.SATISFACTION_TEXT' },
  ];
  readonly offers: readonly HomeOffer[] = [
    { icon: 'pi-gift', titleKey: 'CUSTOMER.HOME.OFFERS.FIRST', textKey: 'CUSTOMER.HOME.OFFERS.FIRST_TEXT', actionKey: 'CUSTOMER.HOME.OFFERS.CLAIM', tone: '#eef4e9' },
    { icon: 'pi-users', titleKey: 'CUSTOMER.HOME.OFFERS.REFER', textKey: 'CUSTOMER.HOME.OFFERS.REFER_TEXT', actionKey: 'CUSTOMER.HOME.OFFERS.INVITE', tone: '#f8efe4' },
    { icon: 'pi-mobile', titleKey: 'CUSTOMER.HOME.OFFERS.APP', textKey: 'CUSTOMER.HOME.OFFERS.APP_TEXT', actionKey: 'CUSTOMER.HOME.OFFERS.GET_APP', tone: '#eaf3f5' },
    { icon: 'pi-star', titleKey: 'CUSTOMER.HOME.OFFERS.POINTS', textKey: 'CUSTOMER.HOME.OFFERS.POINTS_TEXT', actionKey: 'CUSTOMER.HOME.OFFERS.JOIN', tone: '#fbf3df' },
  ];

  constructor() {
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
    return this.reviewName(review).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  promotionLink(promotion: Promotion): string {
    return promotion.button_link?.startsWith('/shop') ? promotion.button_link : '/shop/products';
  }

  private async loadHome(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [products, categories, promotions, reviews] = await Promise.all([
        this.productsService.getProducts(),
        this.categoriesService.getCategoriesWithProductCount(),
        this.promotionsService.getPromotions(),
        this.reviewsService.getPublishedReviews(3),
      ]);
      this.products.set(products);
      this.categories.set(categories.filter((category) => category.is_active !== false).slice(0, 4));
      this.promotions.set(promotions);
      this.reviews.set(reviews);
    } catch (error) {
      console.error('Unable to load customer home data.', error);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
