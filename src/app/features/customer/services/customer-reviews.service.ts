import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
  CustomerReviewEditPayload,
  CustomerReviewPayload,
  Review,
  ReviewCustomerSummary,
  ReviewStatus,
} from '../../../data-access';

const OWN_REVIEW_SELECT = `
  id, product_id, user_id, rating, comment, status, admin_reply, admin_reply_at,
  admin_reply_by, is_liked_by_admin, is_featured, helpful_count, created_at,
  profiles:user_id (id, full_name, email, avatar_url)
`;

type ReviewRelation<T> = T | T[] | null;

interface ReviewRecord {
  id: string;
  product_id: string | null;
  user_id: string | null;
  rating: number | null;
  comment: string | null;
  status: ReviewStatus | null;
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_reply_by: string | null;
  is_liked_by_admin: boolean | null;
  is_featured: boolean | null;
  helpful_count: number | null;
  created_at: string | null;
  profiles?: ReviewRelation<ReviewCustomerSummary>;
}

interface ReviewCountRecord {
  product_id: string | null;
}

interface PublishedReviewsCacheEntry {
  readonly request: Promise<Review[]>;
  readonly timestamp: number;
}

interface PublishedReviewCountCacheEntry {
  readonly count: number;
  readonly timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class CustomerReviewsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly publishedReviewsCacheTtlMs = 30 * 1000;
  private readonly publishedReviewCountsCacheTtlMs = 5 * 60 * 1000;
  private readonly publishedReviewsByProduct = new Map<string, PublishedReviewsCacheEntry>();
  private readonly publishedReviewCountByProduct = new Map<
    string,
    PublishedReviewCountCacheEntry
  >();

  async getPublishedReviews(limit = 3): Promise<Review[]> {
    const { data, error } = await this.supabase
      .rpc('get_public_product_reviews', {
        p_product_id: null,
        p_limit: limit,
      });

    if (error) throw new Error('Unable to load reviews.');
    const reviews = (data ?? []) as ReviewRecord[];
    return reviews.map((review) => this.mapReview(review));
  }

  async getPublishedReviewsByProduct(productId: string): Promise<Review[]> {
    const normalizedProductId = productId.trim();
    const existing = this.publishedReviewsByProduct.get(normalizedProductId);
    if (existing && Date.now() - existing.timestamp < this.publishedReviewsCacheTtlMs) {
      return existing.request;
    }

    const request = this.loadPublishedReviewsByProduct(normalizedProductId);
    this.publishedReviewsByProduct.set(normalizedProductId, { request, timestamp: Date.now() });

    try {
      const reviews = await request;
      this.publishedReviewCountByProduct.set(normalizedProductId, {
        count: reviews.length,
        timestamp: Date.now(),
      });
      return reviews;
    } catch (error: unknown) {
      if (this.publishedReviewsByProduct.get(normalizedProductId)?.request === request) {
        this.publishedReviewsByProduct.delete(normalizedProductId);
      }
      throw error;
    }
  }

  async getPublishedReviewCountsByProduct(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const uniqueProductIds = [
      ...new Set(productIds.map((productId) => productId.trim()).filter(Boolean)),
    ];
    const missingProductIds = uniqueProductIds.filter(
      (productId) => {
        const cached = this.publishedReviewCountByProduct.get(productId);
        return (
          !cached || Date.now() - cached.timestamp >= this.publishedReviewCountsCacheTtlMs
        );
      },
    );

    if (missingProductIds.length > 0) {
      const { data, error } = await this.supabase
        .from('reviews')
        .select('product_id')
        .in('product_id', missingProductIds)
        .eq('status', 'published')
        .not('comment', 'is', null);

      if (error) throw new Error('Unable to load review counts.');

      const counts = new Map(missingProductIds.map((productId) => [productId, 0]));
      for (const review of (data ?? []) as ReviewCountRecord[]) {
        if (review.product_id && counts.has(review.product_id)) {
          counts.set(review.product_id, (counts.get(review.product_id) ?? 0) + 1);
        }
      }

      counts.forEach((count, productId) => {
        this.publishedReviewCountByProduct.set(productId, { count, timestamp: Date.now() });
      });
    }

    return new Map(
      uniqueProductIds.map((productId) => [
        productId,
        this.publishedReviewCountByProduct.get(productId)?.count ?? 0,
      ]),
    );
  }

  private async loadPublishedReviewsByProduct(productId: string): Promise<Review[]> {
    const { data, error } = await this.supabase
      .rpc('get_public_product_reviews', {
        p_product_id: productId,
        p_limit: null,
      });

    if (error) throw new Error('Unable to load reviews.');
    const reviews = (data ?? []) as ReviewRecord[];
    return reviews.map((review) => this.mapReview(review));
  }

  async getCurrentUserReview(productId: string, userId: string): Promise<Review | null> {
    const { data, error } = await this.supabase
      .from('reviews')
      .select(OWN_REVIEW_SELECT)
      .eq('product_id', productId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error('Unable to check your review.');
    return data ? this.mapReview(data as ReviewRecord) : null;
  }

  async createReview(payload: CustomerReviewPayload): Promise<void> {
    const { data, error: authError } = await this.supabase.auth.getUser();
    const user = data?.user ?? null;

    if (authError) throw new Error(authError.message ?? 'Unable to authenticate user.');
    if (!user?.id) throw new Error('Authentication required.');

    const { error } = await this.supabase.rpc('submit_product_review', {
      p_product_id: payload.productId,
      p_rating: payload.rating,
      p_comment: payload.comment,
    });

    if (error) {
      throw new Error(error.code === '23505' ? 'REVIEW_ALREADY_EXISTS' : 'REVIEW_SUBMIT_FAILED');
    }

    this.publishedReviewsByProduct.delete(payload.productId);
    this.publishedReviewCountByProduct.delete(payload.productId);
  }

  async updateOwnReview(payload: CustomerReviewEditPayload): Promise<void> {
    const { data, error: authError } = await this.supabase.auth.getUser();
    const user = data?.user ?? null;

    if (authError) throw new Error(authError.message ?? 'Unable to authenticate user.');
    if (!user?.id) throw new Error('Authentication required.');

    const { error } = await this.supabase.rpc('edit_own_product_review', {
      p_review_id: payload.reviewId,
      p_rating: payload.rating,
      p_comment: payload.comment,
    });

    if (error) throw new Error('REVIEW_UPDATE_FAILED');
    this.publishedReviewsByProduct.clear();
    this.publishedReviewCountByProduct.clear();
  }

  private mapReview(review: ReviewRecord): Review {
    return {
      id: review.id,
      product_id: review.product_id ?? null,
      user_id: review.user_id ?? null,
      rating: review.rating ?? null,
      comment: review.comment ?? null,
      status: review.status ?? 'published',
      admin_reply: review.admin_reply ?? null,
      admin_reply_at: review.admin_reply_at ?? null,
      admin_reply_by: review.admin_reply_by ?? null,
      is_liked_by_admin: review.is_liked_by_admin ?? false,
      is_featured: review.is_featured ?? false,
      helpful_count: review.helpful_count ?? 0,
      created_at: review.created_at ?? null,
      product: null,
      customer: this.firstRelation(review.profiles),
    };
  }

  private firstRelation<T>(relation: ReviewRelation<T> | undefined): T | null {
    if (Array.isArray(relation)) return relation[0] ?? null;
    return relation ?? null;
  }
}
