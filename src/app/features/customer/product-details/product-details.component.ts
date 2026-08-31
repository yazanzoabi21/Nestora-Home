import { CurrencyPipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../core/services/auth';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../shared/components/customer-loyalty-points-badge';
import { ProductReviewsComponent } from '../components/product-reviews';
import {
  CustomerProduct,
  CustomerProductDetails,
  CustomerProductMediaItem,
  CustomerProductVariant,
} from '../models';
import {
  CustomerRecentlyViewedService,
  CustomerShoppingStateService,
  LoyaltyPointsCalculatorService,
  CustomerCatalogService,
  CustomerProductVideosService,
} from '../services';
import { CustomerPromotionsService } from '../services/customer-promotions.service';

type DetailsTab = 'description' | 'features' | 'reviews';

interface ProductPromotionBreadcrumb {
  slug: string;
  title: string;
}

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    KeyValuePipe,
    CustomerLoyaltyPointsBadgeComponent,
    RouterLink,
    ProductReviewsComponent,
    TranslatePipe,
  ],
  templateUrl: './product-details.component.html',
  host: {
    class: 'block',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CustomerCatalogService);
  private readonly productVideos = inject(CustomerProductVideosService);
  private readonly promotions = inject(CustomerPromotionsService);
  private readonly recentlyViewed = inject(CustomerRecentlyViewedService);
  private readonly translate = inject(TranslateService);

  readonly shopping = inject(CustomerShoppingStateService);
  readonly customerAuth = inject(CustomerAuthService);
  readonly loyalty = inject(LoyaltyPointsCalculatorService);

  private readonly swipeThresholdPx = 48;
  private readonly imagePreloadCache = new Map<string, Promise<void>>();

  private touchStartX: number | null = null;
  private touchStartY: number | null = null;
  private lastHandledRealtimeRevision = 0;
  private lastHandledVideoRealtimeRevision = 0;

  readonly product = signal<CustomerProductDetails | null>(null);
  readonly promotionBreadcrumb = signal<ProductPromotionBreadcrumb | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly quantity = signal(1);
  readonly currentMediaIndex = signal(0);
  readonly selectedVariant = signal<CustomerProductVariant | null>(null);
  readonly variantImageOverride = signal<string | null>(null);
  readonly activeTab = signal<DetailsTab>('description');

  readonly stars = [1, 2, 3, 4, 5];
  readonly returnUrl = this.router.url;

  readonly galleryMedia = computed<CustomerProductMediaItem[]>(() => {
    const item = this.product();

    if (!item) {
      return [];
    }

    const imageUrls = [item.imageUrl, ...(item.gallery ?? [])]
      .filter((image): image is string => Boolean(image?.trim()))
      .map((image) => image.trim());
    const images = [...new Set(imageUrls)].map(
      (url): CustomerProductMediaItem => ({
        id: `image:${url}`,
        type: 'image',
        url,
        posterUrl: null,
      }),
    );
    const videos = item.videos
      .filter((video) => Boolean(video.url.trim()))
      .map(
        (video): CustomerProductMediaItem => ({
          id: `video:${video.id}`,
          type: 'video',
          url: video.url,
          posterUrl: video.posterUrl,
        }),
      );

    return [...images, ...videos];
  });

  readonly selectedMedia = computed<CustomerProductMediaItem | null>(() => {
    const variantImage = this.variantImageOverride();
    if (variantImage) {
      return {
        id: `variant:${variantImage}`,
        type: 'image',
        url: variantImage,
        posterUrl: null,
      };
    }
    const media = this.galleryMedia();
    const selectedIndex = this.currentMediaIndex();

    return media[selectedIndex] ?? null;
  });

  readonly displayProduct = computed<CustomerProduct | null>(() => {
    const item = this.product();
    const variant = this.selectedVariant();
    if (!item) return null;
    if (!variant) return item;

    const baseRegularPrice = item.originalPrice ?? item.price;
    const baseSalePrice = item.originalPrice ? item.price : null;
    const regularPrice = variant.price ?? baseRegularPrice;
    const salePrice = variant.salePrice ?? baseSalePrice;
    const effectivePrice =
      salePrice !== null && salePrice > 0 && salePrice < regularPrice ? salePrice : regularPrice;
    const stock = Math.max(0, variant.stock ?? item.stock);

    return {
      ...item,
      name: variant.name?.trim() || item.name,
      imageUrl: variant.imageUrl || item.imageUrl,
      price: effectivePrice,
      originalPrice: effectivePrice < regularPrice ? regularPrice : null,
      discountPercentage:
        regularPrice > 0 && effectivePrice < regularPrice
          ? Math.round(((regularPrice - effectivePrice) / regularPrice) * 100)
          : null,
      stock,
      inStock: variant.isActive && item.isActive && stock > 0,
      sku: variant.sku ?? item.sku,
      variantId: variant.id,
      variantLabel: variant.name || `${variant.optionName}: ${variant.optionValue}`,
      variantOptionName: variant.optionName,
      variantOptionValue: variant.optionValue,
      variantAttributes: variant.attributes,
    };
  });

  readonly hasMultipleMedia = computed(
    () => this.galleryMedia().length > 1,
  );

  readonly variantSelectorLabel = computed(() => {
    const names = [...new Set((this.product()?.variants ?? []).map((variant) => variant.optionName))];
    return names.length === 1
      ? names[0]
      : this.translate.instant('CUSTOMER.PRODUCT_DETAILS.OPTIONS');
  });

  readonly currentMediaNumber = computed(() => {
    const mediaCount = this.galleryMedia().length;

    return mediaCount > 0 ? this.currentMediaIndex() + 1 : 0;
  });

  readonly wishlisted = computed(() => {
    const item = this.product();

    return item
      ? this.shopping.wishlistIds().has(item.id)
      : false;
  });

  readonly cartQuantity = computed(() => {
    const item = this.displayProduct();

    return item ? this.shopping.quantityFor(item.id, item.variantId) : 0;
  });

  readonly cartLoading = computed(() => {
    const item = this.product();

    return item
      ? this.shopping.pendingProductIds().has(item.id)
      : false;
  });

  readonly canIncreaseCartQuantity = computed(() => {
    const item = this.displayProduct();

    return Boolean(
      item &&
      this.cartQuantity() > 0 &&
      !this.cartLoading() &&
      this.shopping.canAdd(item),
    );
  });

  readonly savings = computed(() => {
    const item = this.displayProduct();

    if (
      !item?.originalPrice ||
      item.originalPrice <= item.price
    ) {
      return null;
    }

    return item.originalPrice - item.price;
  });

  readonly loyaltyPreview = computed(() => this.loyalty.preview(this.displayProduct()?.price ?? 0));
  readonly loyaltyRedemptionQuantity = computed(() => this.cartQuantity() || this.quantity());
  readonly loyaltyRedemptionCost = computed(
    () => this.loyaltyPreview().rewardCost * this.loyaltyRedemptionQuantity(),
  );
  readonly canRedeemWithPoints = computed(() =>
    this.loyalty.canRedeem(
      this.loyaltyPreview().rewardCost,
      this.loyaltyRedemptionQuantity(),
    ),
  );
  readonly loyaltyPointsNeeded = computed(() =>
    this.loyalty.pointsNeeded(
      this.loyaltyPreview().rewardCost,
      this.loyaltyRedemptionQuantity(),
    ),
  );

  readonly availableQuantity = computed(() => {
    const item = this.displayProduct();

    return item
      ? this.shopping.remainingStock(item)
      : 0;
  });

  constructor() {
    effect(() => {
      const change = this.catalog.realtimeChange();
      const currentProduct = this.product();
      if (
        !currentProduct ||
        change.revision === 0 ||
        change.revision === this.lastHandledRealtimeRevision
      ) {
        return;
      }

      this.lastHandledRealtimeRevision = change.revision;
      const isRelevant =
        change.affectsAllProducts ||
        change.productIds.includes(currentProduct.id) ||
        (currentProduct.categoryId !== null &&
          currentProduct.categoryId !== undefined &&
          change.categoryIds.includes(currentProduct.categoryId));

      if (isRelevant) untracked(() => void this.load(true));
    });
    effect(() => {
      const change = this.productVideos.realtimeChange();
      const currentProduct = this.product();
      if (
        !currentProduct ||
        change.revision === 0 ||
        change.revision === this.lastHandledVideoRealtimeRevision
      ) {
        return;
      }

      this.lastHandledVideoRealtimeRevision = change.revision;
      if (!change.productIds.includes(currentProduct.id)) return;

      const videos = this.productVideos.videosSnapshot()[currentProduct.id];
      if (videos) {
        untracked(() => this.product.update((product) =>
          product ? { ...product, videos: [...videos] } : product,
        ));
      }
    });
    void this.loadPromotionBreadcrumb();
    void this.load();
  }

  selectMedia(index: number): void {
    this.variantImageOverride.set(null);
    this.activateMedia(index);
  }

  selectVariant(variant: CustomerProductVariant): void {
    if (!variant.isActive || (variant.stock ?? this.product()?.stock ?? 0) <= 0) return;
    this.selectedVariant.set(variant);
    this.quantity.set(1);
    this.variantImageOverride.set(variant.imageUrl?.trim() || null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: variant.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  isVariantUnavailable(variant: CustomerProductVariant): boolean {
    return !variant.isActive || (variant.stock ?? this.product()?.stock ?? 0) <= 0;
  }

  showPreviousMedia(): void {
    this.variantImageOverride.set(null);
    const mediaCount = this.galleryMedia().length;

    if (mediaCount <= 1) {
      return;
    }

    const previousIndex =
      (this.currentMediaIndex() - 1 + mediaCount) % mediaCount;

    this.activateMedia(previousIndex);
  }

  showNextMedia(): void {
    this.variantImageOverride.set(null);
    const mediaCount = this.galleryMedia().length;

    if (mediaCount <= 1) {
      return;
    }

    const nextIndex =
      (this.currentMediaIndex() + 1) % mediaCount;

    this.activateMedia(nextIndex);
  }

  onGalleryKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.showPreviousMedia();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.showNextMedia();
    }
  }

  onGalleryTouchStart(event: TouchEvent): void {
    const touch = event.touches.item(0);

    if (!touch) {
      return;
    }

    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onGalleryTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches.item(0);

    if (
      !touch ||
      this.touchStartX === null ||
      this.touchStartY === null ||
      !this.hasMultipleMedia()
    ) {
      this.resetTouchState();
      return;
    }

    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    this.resetTouchState();

    const isHorizontalSwipe =
      Math.abs(deltaX) > Math.abs(deltaY) &&
      Math.abs(deltaX) >= this.swipeThresholdPx;

    if (!isHorizontalSwipe) {
      return;
    }

    if (deltaX < 0) {
      this.showNextMedia();
      return;
    }

    this.showPreviousMedia();
  }

  decrease(): void {
    this.quantity.update((value) =>
      Math.max(1, value - 1),
    );
  }

  increase(): void {
    if (this.quantity() >= this.availableQuantity()) {
      return;
    }

    this.quantity.update((value) => value + 1);
  }

  addToCart(): void {
    const item = this.displayProduct();

    if (
      !item ||
      this.availableQuantity() < this.quantity()
    ) {
      return;
    }

    void this.shopping.addToCart(
      item,
      this.quantity(),
    );
  }

  async redeemWithPoints(): Promise<void> {
    const item = this.displayProduct();
    if (!item) return;

    if (!this.customerAuth.isAuthenticated()) {
      await this.router.navigate(['/auth/customer-login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }

    if (!this.canRedeemWithPoints()) return;

    if (this.cartQuantity() === 0) {
      await this.shopping.addToCart(item, this.quantity());
    }
    this.shopping.clearAppliedDiscount();
    this.loyalty.requestProductRedemption(item.id, item.variantId);
    await this.router.navigate(['/shop/cart']);
  }

  async decreaseCartQuantity(): Promise<void> {
    const item = this.displayProduct();
    const currentQuantity = this.cartQuantity();

    if (!item || currentQuantity <= 0 || this.cartLoading()) {
      return;
    }

    if (currentQuantity === 1) {
      await this.shopping.removeFromCart(item.id, item.variantId);
      return;
    }

    await this.shopping.setQuantity(
      item.id,
      currentQuantity - 1,
      item.variantId,
    );
  }

  async increaseCartQuantity(): Promise<void> {
    const item = this.displayProduct();

    if (
      !item ||
      !this.canIncreaseCartQuantity()
    ) {
      return;
    }

    await this.shopping.setQuantity(
      item.id,
      this.cartQuantity() + 1,
      item.variantId,
    );
  }

  async toggleWishlist(): Promise<void> {
    const item = this.displayProduct();

    if (!item) {
      return;
    }

    await this.shopping.toggleWishlist(item);
  }

  selectTab(tab: DetailsTab): void {
    this.activeTab.set(tab);
  }

  private activateMedia(index: number): void {
    const media = this.galleryMedia();

    if (
      index < 0 ||
      index >= media.length ||
      index === this.currentMediaIndex()
    ) {
      return;
    }

    this.currentMediaIndex.set(index);

    this.preloadAdjacentImages(index);
  }

  private preloadAdjacentImages(index: number): void {
    const media = this.galleryMedia();
    const mediaCount = media.length;

    if (mediaCount <= 1) {
      return;
    }

    const previousIndex =
      (index - 1 + mediaCount) % mediaCount;

    const nextIndex =
      (index + 1) % mediaCount;

    const adjacentMedia = [media[previousIndex], media[nextIndex]];
    for (const item of adjacentMedia) {
      if (item.type === 'image') void this.preloadImage(item.url);
    }
  }

  private preloadGalleryImages(): void {
    for (const media of this.galleryMedia()) {
      if (media.type === 'image') void this.preloadImage(media.url);
    }
  }

  private preloadImage(imageUrl: string): Promise<void> {
    if (
      !imageUrl ||
      typeof Image === 'undefined'
    ) {
      return Promise.resolve();
    }

    const cachedRequest =
      this.imagePreloadCache.get(imageUrl);

    if (cachedRequest) {
      return cachedRequest;
    }

    const preloadRequest = new Promise<void>((resolve) => {
      const image = new Image();

      image.decoding = 'async';

      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = imageUrl;

      if (image.complete) {
        resolve();
      }
    });

    this.imagePreloadCache.set(
      imageUrl,
      preloadRequest,
    );

    return preloadRequest;
  }

  private resetTouchState(): void {
    this.touchStartX = null;
    this.touchStartY = null;
  }

  private async load(preserveState = false): Promise<void> {
    const identifier =
      this.route.snapshot.paramMap.get('identifier');

    if (!identifier) {
      this.loading.set(false);
      return;
    }

    const previousVariantId = preserveState ? this.selectedVariant()?.id ?? null : null;
    const previousMediaId = preserveState ? this.selectedMedia()?.id ?? null : null;
    const previousQuantity = this.quantity();

    if (!preserveState) this.loading.set(true);
    this.error.set(false);

    try {
      const item =
        await this.catalog.getProductDetails(identifier);

      this.product.set(item);
      this.quantity.set(preserveState ? previousQuantity : 1);

      const requestedVariantId = this.route.snapshot.queryParamMap.get('variant');
      const initialVariant =
        item?.variants.find(
          (variant) => variant.id === previousVariantId && variant.isActive,
        ) ??
        item?.variants.find(
          (variant) => variant.id === requestedVariantId && variant.isActive,
        ) ?? item?.variants.find((variant) => variant.isActive) ?? null;
      this.selectedVariant.set(initialVariant);
      const refreshedMedia = this.galleryMedia();
      const preservedMediaIndex = previousMediaId
        ? refreshedMedia.findIndex((media) => media.id === previousMediaId)
        : -1;
      this.currentMediaIndex.set(preservedMediaIndex >= 0 ? preservedMediaIndex : 0);
      this.variantImageOverride.set(
        preservedMediaIndex >= 0 ? null : initialVariant?.imageUrl?.trim() || null,
      );
      this.quantity.update((quantity) => Math.max(1, Math.min(quantity, this.availableQuantity())));

      if (item && !preserveState) {
        void this.recentlyViewed.recordView(item.id);
      }

      // Load all gallery images in the background without
      // delaying the initial product display.
      this.preloadGalleryImages();
    } catch {
      if (!preserveState) {
        this.error.set(true);
        this.product.set(null);
      }
    } finally {
      if (!preserveState) this.loading.set(false);
    }
  }

  private async loadPromotionBreadcrumb(): Promise<void> {
    const promotionSlug = this.route.snapshot.queryParamMap.get('promotion')?.trim();

    if (!promotionSlug) {
      return;
    }

    try {
      const promotion = await this.promotions.getPromotionBySlug(promotionSlug);

      if (!promotion) {
        return;
      }

      this.promotionBreadcrumb.set({
        slug: promotionSlug,
        title: promotion.title,
      });
    } catch {
      this.promotionBreadcrumb.set(null);
    }
  }

  categorySlug(category: string): string {
    return category
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
