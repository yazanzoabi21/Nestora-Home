import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { AdminSidebarBadgesService } from '../../../core/services/navigation/admin-sidebar-badges.service';
import { Review, ReviewFilters, ReviewStatus, ReviewsService } from '../../../data-access';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

interface AdminSelectOption<T extends string | number | null = string> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    CommonModule,
    FormsModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css',
})
export class ReviewsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly reviewsService = inject(ReviewsService);
  private readonly sidebarBadges = inject(AdminSidebarBadgesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly reviews = signal<Review[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly selectedReview = signal<Review | null>(null);
  readonly reviewToDelete = signal<Review | null>(null);
  readonly replyDraft = signal('');
  readonly detailsOpen = signal(false);
  readonly replyOpen = signal(false);
  readonly deleteOpen = signal(false);

  readonly filters = signal<ReviewFilters>({
    search: '',
    productId: null,
    rating: null,
    status: 'all',
  });

  readonly statusOptions: AdminSelectOption<ReviewStatus | 'all'>[] = [
    { label: 'REVIEWS.ALL_STATUSES', value: 'all' },
    { label: 'REVIEWS.STATUS_PENDING', value: 'pending' },
    { label: 'REVIEWS.STATUS_PUBLISHED', value: 'published' },
    { label: 'REVIEWS.STATUS_HIDDEN', value: 'hidden' },
  ];

  readonly ratingOptions: AdminSelectOption<number | null>[] = [
    { label: 'REVIEWS.ALL_RATINGS', value: null },
    { label: '5 stars', value: 5 },
    { label: '4 stars', value: 4 },
    { label: '3 stars', value: 3 },
    { label: '2 stars', value: 2 },
    { label: '1 star', value: 1 },
  ];

  readonly productOptions = computed<AdminSelectOption<string | null>[]>(() => {
    const products = new Map<string, string>();

    this.reviews().forEach((review) => {
      if (review.product_id && review.product?.name) {
        products.set(review.product_id, review.product.name);
      }
    });

    return [
      { label: 'REVIEWS.ALL_PRODUCTS', value: null },
      ...Array.from(products.entries())
        .sort((first, second) => first[1].localeCompare(second[1]))
        .map(([value, label]) => ({ label, value })),
    ];
  });

  readonly filteredReviews = computed(() => {
    const filters = this.filters();
    const search = filters.search.trim().toLowerCase();

    return this.reviews().filter((review) => {
      const searchable = [
        review.product?.name,
        review.customer?.full_name,
        review.customer?.email,
        review.comment,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !search || searchable.includes(search);
      const matchesProduct = !filters.productId || review.product_id === filters.productId;
      const matchesRating = filters.rating === null || review.rating === filters.rating;
      const matchesStatus = filters.status === 'all' || review.status === filters.status;

      return matchesSearch && matchesProduct && matchesRating && matchesStatus;
    });
  });

  readonly stats = computed(() => this.reviewsService.calculateStats(this.reviews()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Total Reviews',
        titleKey: 'REVIEWS.TOTAL_REVIEWS',
        value: stats.total.toString(),
        icon: 'pi pi-comments',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Average Rating',
        titleKey: 'REVIEWS.AVG_RATING',
        value: stats.averageRating.toFixed(1),
        icon: 'pi pi-star-fill',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Pending Reviews',
        titleKey: 'REVIEWS.PENDING_REVIEWS',
        value: stats.pending.toString(),
        icon: 'pi pi-clock',
        iconColor: '#b7791f',
        iconBg: '#fff8e8',
        showChart: false,
      },
      {
        title: 'With Replies',
        titleKey: 'REVIEWS.WITH_REPLIES',
        value: stats.withReply.toString(),
        icon: 'pi pi-reply',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
    ];
  });

  async ngOnInit(): Promise<void> {
    await this.loadReviews();
  }

  async loadReviews(): Promise<void> {
    this.loading.set(true);

    try {
      this.reviews.set(await this.reviewsService.getReviews());
    } catch (error) {
      this.toast.failed(
        this.translate.instant('REVIEWS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('REVIEWS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  refreshReviews(): void {
    void this.loadReviews();
    this.toast.info(this.translate.instant('REVIEWS.TOAST.REFRESHED'));
  }

  updateFilter<K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]): void {
    this.filters.update((filters) => ({
      ...filters,
      [key]: value,
    }));
  }

  clearFilters(): void {
    this.filters.set({
      search: '',
      productId: null,
      rating: null,
      status: 'all',
    });
  }

  textValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  openDetails(review: Review): void {
    this.selectedReview.set(review);
    this.detailsOpen.set(true);
  }

  closeDetails(): void {
    this.detailsOpen.set(false);
    this.selectedReview.set(null);
  }

  openReply(review: Review): void {
    this.selectedReview.set(review);
    this.replyDraft.set(review.admin_reply ?? '');
    this.replyOpen.set(true);
  }

  closeReply(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.replyOpen.set(false);
    this.selectedReview.set(null);
    this.replyDraft.set('');
  }

  async saveReply(): Promise<void> {
    const review = this.selectedReview();
    const reply = this.replyDraft().trim();

    if (this.saving()) {
      return;
    }

    if (!review || !reply) {
      this.toast.warn(
        this.translate.instant('REVIEWS.TOAST.EMPTY_REPLY_TITLE'),
        this.translate.instant('REVIEWS.TOAST.EMPTY_REPLY_DETAIL')
      );
      return;
    }

    this.saving.set(true);

    try {
      await this.reviewsService.replyToReview(
        review.id,
        reply,
        this.authService.currentUserProfile()?.id ?? null
      );
      await this.afterMutation();
      this.closeReply(true);
      this.toast.success(this.translate.instant('REVIEWS.TOAST.REPLY_SAVED'));
    } catch (error) {
      this.showMutationError(error);
    } finally {
      this.saving.set(false);
    }
  }

  async clearReply(): Promise<void> {
    const review = this.selectedReview();

    if (!review?.admin_reply || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await this.reviewsService.clearReply(review.id);
      await this.afterMutation();
      this.closeReply(true);
      this.toast.success(this.translate.instant('REVIEWS.TOAST.REPLY_CLEARED'));
    } catch (error) {
      this.showMutationError(error);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleAdminLike(review: Review): Promise<void> {
    await this.runReviewAction(
      () => this.reviewsService.toggleAdminLike(review),
      review.is_liked_by_admin ? 'REVIEWS.TOAST.UNLIKED' : 'REVIEWS.TOAST.LIKED'
    );
  }

  async toggleFeatured(review: Review): Promise<void> {
    await this.runReviewAction(
      () => this.reviewsService.toggleFeatured(review),
      review.is_featured ? 'REVIEWS.TOAST.UNFEATURED' : 'REVIEWS.TOAST.FEATURED'
    );
  }

  async updateStatus(review: Review, status: ReviewStatus): Promise<void> {
    if (review.status === status) {
      return;
    }

    await this.runReviewAction(
      () => this.reviewsService.updateStatus(review.id, status),
      'REVIEWS.TOAST.STATUS_UPDATED'
    );
  }

  openDelete(review: Review): void {
    this.reviewToDelete.set(review);
    this.deleteOpen.set(true);
  }

  closeDelete(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.deleteOpen.set(false);
    this.reviewToDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const review = this.reviewToDelete();

    if (!review || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await this.reviewsService.deleteReview(review.id);
      await this.afterMutation();
      this.closeDelete(true);
      this.toast.success(this.translate.instant('REVIEWS.TOAST.DELETED'));
    } catch (error) {
      this.showMutationError(error);
    } finally {
      this.saving.set(false);
    }
  }

  productName(review: Review): string {
    return review.product?.name || this.translate.instant('REVIEWS.UNKNOWN_PRODUCT');
  }

  customerName(review: Review): string {
    return review.customer?.full_name || review.customer?.email || this.translate.instant('REVIEWS.UNKNOWN_CUSTOMER');
  }

  customerSubtitle(review: Review): string {
    if (review.customer?.full_name && review.customer?.email) {
      return review.customer.email;
    }

    return review.user_id ? this.translate.instant('REVIEWS.REGISTERED_CUSTOMER') : this.translate.instant('REVIEWS.GUEST_CUSTOMER');
  }

  initials(value: string | null | undefined): string {
    const source = value?.trim() || '?';

    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  statusLabelKey(status: ReviewStatus): string {
    return `REVIEWS.STATUS_${status.toUpperCase()}`;
  }

  statusClass(status: ReviewStatus): string {
    switch (status) {
      case 'pending':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'hidden':
        return 'bg-[#f3eee7] text-[#675f55]';
      case 'published':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  stars(rating: number | null): string[] {
    const value = Math.max(0, Math.min(5, rating ?? 0));

    return Array.from({ length: 5 }, (_, index) => (index < value ? 'pi-star-fill' : 'pi-star'));
  }

  formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  shortComment(review: Review): string {
    const comment = review.comment?.trim();

    if (!comment) {
      return this.translate.instant('REVIEWS.NO_COMMENT');
    }

    return comment;
  }

  private async runReviewAction(action: () => Promise<void>, successKey: string): Promise<void> {
    this.saving.set(true);

    try {
      await action();
      await this.afterMutation();
      this.toast.success(this.translate.instant(successKey));
    } catch (error) {
      this.showMutationError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private async afterMutation(): Promise<void> {
    await this.loadReviews();
    await Promise.all([
      this.sidebarBadges.refreshBadge('reviews.pending'),
      this.sidebarBadges.refreshBadge('reviews.total'),
    ]);
  }

  private showMutationError(error: unknown): void {
    this.toast.failed(
      this.translate.instant('REVIEWS.TOAST.SAVE_FAILED_TITLE'),
      this.errorDetail(error, this.translate.instant('REVIEWS.TOAST.SAVE_FAILED_DETAIL'))
    );
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
