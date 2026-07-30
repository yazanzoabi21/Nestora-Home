import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { ProductReviewsComponent } from '../components/product-reviews';
import { CustomerProductDetails } from '../models';
import {
  CustomerRecentlyViewedService,
  CustomerShoppingStateService,
  NewArrivalsService,
} from '../services';

type DetailsTab = 'description' | 'features' | 'reviews';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
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
  private readonly catalog = inject(NewArrivalsService);
  private readonly recentlyViewed = inject(CustomerRecentlyViewedService);

  readonly shopping = inject(CustomerShoppingStateService);

  private readonly swipeThresholdPx = 48;
  private readonly imagePreloadCache = new Map<string, Promise<void>>();

  private touchStartX: number | null = null;
  private touchStartY: number | null = null;

  readonly product = signal<CustomerProductDetails | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly quantity = signal(1);
  readonly currentImageIndex = signal(0);
  readonly activeTab = signal<DetailsTab>('description');

  readonly stars = [1, 2, 3, 4, 5];
  readonly returnUrl = this.router.url;

  readonly galleryImages = computed<string[]>(() => {
    const item = this.product();

    if (!item) {
      return [];
    }

    const images = [item.imageUrl, ...(item.gallery ?? [])]
      .filter((image): image is string => Boolean(image?.trim()))
      .map((image) => image.trim());

    return [...new Set(images)];
  });

  readonly selectedImage = computed(() => {
    const images = this.galleryImages();
    const selectedIndex = this.currentImageIndex();

    return images[selectedIndex] ?? this.product()?.imageUrl ?? '';
  });

  readonly hasMultipleImages = computed(
    () => this.galleryImages().length > 1,
  );

  readonly currentImageNumber = computed(() => {
    const imageCount = this.galleryImages().length;

    return imageCount > 0 ? this.currentImageIndex() + 1 : 0;
  });

  readonly wishlisted = computed(() => {
    const item = this.product();

    return item
      ? this.shopping.wishlistIds().has(item.id)
      : false;
  });

  readonly savings = computed(() => {
    const item = this.product();

    if (
      !item?.originalPrice ||
      item.originalPrice <= item.price
    ) {
      return null;
    }

    return item.originalPrice - item.price;
  });

  readonly availableQuantity = computed(() => {
    const item = this.product();

    return item
      ? this.shopping.remainingStock(item)
      : 0;
  });

  constructor() {
    void this.load();
  }

  selectImage(index: number): void {
    this.activateImage(index);
  }

  showPreviousImage(): void {
    const imageCount = this.galleryImages().length;

    if (imageCount <= 1) {
      return;
    }

    const previousIndex =
      (this.currentImageIndex() - 1 + imageCount) % imageCount;

    this.activateImage(previousIndex);
  }

  showNextImage(): void {
    const imageCount = this.galleryImages().length;

    if (imageCount <= 1) {
      return;
    }

    const nextIndex =
      (this.currentImageIndex() + 1) % imageCount;

    this.activateImage(nextIndex);
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
      !this.hasMultipleImages()
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
      this.showNextImage();
      return;
    }

    this.showPreviousImage();
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
    const item = this.product();

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

  async toggleWishlist(): Promise<void> {
    const item = this.product();

    if (!item) {
      return;
    }

    await this.shopping.toggleWishlist(item);
  }

  selectTab(tab: DetailsTab): void {
    this.activeTab.set(tab);
  }

  private activateImage(index: number): void {
    const images = this.galleryImages();

    if (
      index < 0 ||
      index >= images.length ||
      index === this.currentImageIndex()
    ) {
      return;
    }

    // Change the displayed image immediately.
    this.currentImageIndex.set(index);

    // Prepare the previous and next images in the background.
    this.preloadAdjacentImages(index);
  }

  private preloadAdjacentImages(index: number): void {
    const images = this.galleryImages();
    const imageCount = images.length;

    if (imageCount <= 1) {
      return;
    }

    const previousIndex =
      (index - 1 + imageCount) % imageCount;

    const nextIndex =
      (index + 1) % imageCount;

    void this.preloadImage(images[previousIndex]);
    void this.preloadImage(images[nextIndex]);
  }

  private preloadGalleryImages(): void {
    for (const imageUrl of this.galleryImages()) {
      void this.preloadImage(imageUrl);
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

  private async load(): Promise<void> {
    const identifier =
      this.route.snapshot.paramMap.get('identifier');

    if (!identifier) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(false);

    try {
      const item =
        await this.catalog.getProductDetails(identifier);

      this.product.set(item);
      this.quantity.set(1);
      this.currentImageIndex.set(0);

      if (item) {
        void this.recentlyViewed.recordView(item.id);
      }

      // Load all gallery images in the background without
      // delaying the initial product display.
      this.preloadGalleryImages();
    } catch {
      this.error.set(true);
      this.product.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
