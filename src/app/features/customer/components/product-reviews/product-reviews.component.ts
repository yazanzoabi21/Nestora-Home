import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { Review, ReviewStatus } from '../../../../data-access';
import { CustomerReviewsService } from '../../services';

interface RatingRow {
  rating: number;
  count: number;
  percentage: number;
}

@Component({
  selector: 'app-product-reviews',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, TranslatePipe],
  templateUrl: './product-reviews.component.html',
  styleUrl: './product-reviews.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductReviewsComponent implements OnChanges {
  private readonly reviewsService = inject(CustomerReviewsService);
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  @Input({ required: true }) productId = '';
  @Input() returnUrl = '/shop/products';

  readonly reviews = signal<Review[]>([]);
  readonly ownReview = signal<Review | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly authenticated = signal(false);
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly success = signal(false);
  readonly formError = signal<string | null>(null);
  readonly rating = signal(0);
  readonly hoverRating = signal(0);
  readonly comment = signal('');
  readonly stars = [1, 2, 3, 4, 5];
  readonly average = computed(() =>
    this.reviews().length
      ? this.reviews().reduce((sum, review) => sum + (review.rating ?? 0), 0) /
        this.reviews().length
      : 0,
  );
  readonly distribution = computed<RatingRow[]>(() =>
    this.stars
      .slice()
      .reverse()
      .map((rating) => {
        const count = this.reviews().filter((review) => review.rating === rating).length;
        return {
          rating,
          count,
          percentage: this.reviews().length ? Math.round((count / this.reviews().length) * 100) : 0,
        };
      }),
  );
  readonly remaining = computed(() => 1000 - this.comment().length);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && this.productId) void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const userId = await this.auth.getCurrentUserId();
      this.authenticated.set(!!userId);
      const [reviews, own] = await Promise.all([
        this.reviewsService.getPublishedReviewsByProduct(this.productId),
        userId
          ? this.reviewsService.getCurrentUserReview(this.productId, userId)
          : Promise.resolve(null),
      ]);
      this.reviews.set(reviews);
      this.ownReview.set(own);
    } catch (error: unknown) {
      this.reviews.set([]);
      this.ownReview.set(null);
      this.error.set(true);
      if (isDevMode()) {
        console.warn('[ProductReviews] Unable to load product reviews.', {
          productId: this.productId,
          error,
        });
      }
    } finally {
      this.loading.set(false);
    }
  }
  signIn(): void {
    void this.router.navigate(['/auth/customer-login'], { queryParams: { returnUrl: this.returnUrl } });
  }
  openForm(): void {
    const own = this.ownReview();
    this.rating.set(own?.rating ?? 0);
    this.comment.set(own?.comment ?? '');
    this.formError.set(null);
    this.success.set(false);
    this.formOpen.set(true);
  }
  closeForm(): void {
    if (!this.saving()) {
      this.formOpen.set(false);
      this.rating.set(0);
      this.comment.set('');
      this.formError.set(null);
    }
  }
  setComment(value: string): void {
    this.comment.set(value.slice(0, 1000));
  }
  statusKey(status: ReviewStatus): string {
    return `PRODUCT_REVIEWS.STATUS.${status.toUpperCase()}`;
  }
  initials(review: Review): string {
    return (review.customer?.full_name || review.customer?.email || '?')
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  customerName(review: Review): string {
    return review.customer?.full_name || review.customer?.email || 'PRODUCT_REVIEWS.CUSTOMER';
  }
  async submit(): Promise<void> {
    if (this.saving()) return;
    const comment = this.comment().trim();
    if (this.rating() < 1 || this.rating() > 5) {
      this.formError.set('PRODUCT_REVIEWS.ERRORS.RATING');
      return;
    }
    if (!comment) {
      this.formError.set('PRODUCT_REVIEWS.ERRORS.COMMENT');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const own = this.ownReview();
      if (own)
        await this.reviewsService.updateOwnReview({
          reviewId: own.id,
          rating: this.rating(),
          comment,
        });
      else
        await this.reviewsService.createReview({
          productId: this.productId,
          rating: this.rating(),
          comment,
        });
      this.formOpen.set(false);
      this.success.set(true);
      await this.load();
    } catch (error) {
      this.formError.set(
        error instanceof Error && error.message === 'REVIEW_ALREADY_EXISTS'
          ? 'PRODUCT_REVIEWS.ERRORS.DUPLICATE'
          : 'PRODUCT_REVIEWS.ERRORS.SUBMIT',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
