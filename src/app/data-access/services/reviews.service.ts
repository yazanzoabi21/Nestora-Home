import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  Review,
  ReviewCustomerSummary,
  ReviewProductSummary,
  ReviewStats,
  ReviewStatus,
  ReviewUpdatePayload,
} from '../models';

const REVIEW_SELECT = `
  id,
  product_id,
  user_id,
  rating,
  comment,
  status,
  admin_reply,
  admin_reply_at,
  admin_reply_by,
  is_liked_by_admin,
  is_featured,
  helpful_count,
  created_at,
  products:product_id (
    id,
    name,
    slug,
    image_url
  ),
  profiles:user_id (
    id,
    full_name,
    email,
    avatar_url
  )
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
  products?: ReviewRelation<ReviewProductSummary>;
  profiles?: ReviewRelation<ReviewCustomerSummary>;
}

@Injectable({
  providedIn: 'root',
})
export class ReviewsService {
  private readonly supabase = inject(SupabaseService).client;

  async getReviews(): Promise<Review[]> {
    const { data, error } = await this.supabase
      .from('reviews')
      .select(REVIEW_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load reviews. ${error.message}`);
    }

    return (data ?? []).map((review) => this.mapReview(review as ReviewRecord));
  }

  async getReviewStats(): Promise<ReviewStats> {
    return this.calculateStats(await this.getReviews());
  }

  async replyToReview(reviewId: string, reply: string, adminId?: string | null): Promise<void> {
    const cleanReply = reply.trim();

    if (!cleanReply) {
      throw new Error('Reply cannot be empty.');
    }

    await this.updateReview(reviewId, {
      admin_reply: cleanReply,
      admin_reply_at: new Date().toISOString(),
      admin_reply_by: adminId ?? null,
    });
  }

  async clearReply(reviewId: string): Promise<void> {
    await this.updateReview(reviewId, {
      admin_reply: null,
      admin_reply_at: null,
      admin_reply_by: null,
    });
  }

  async toggleAdminLike(review: Review): Promise<void> {
    await this.updateReview(review.id, {
      is_liked_by_admin: !review.is_liked_by_admin,
    });
  }

  async toggleFeatured(review: Review): Promise<void> {
    await this.updateReview(review.id, {
      is_featured: !review.is_featured,
    });
  }

  async updateStatus(reviewId: string, status: ReviewStatus): Promise<void> {
    await this.updateReview(reviewId, { status });
  }

  async deleteReview(reviewId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId);

    if (error) {
      throw new Error(`Unable to delete review. ${error.message}`);
    }
  }

  calculateStats(reviews: Review[]): ReviewStats {
    const ratedReviews = reviews.filter((review) => typeof review.rating === 'number');
    const totalRating = ratedReviews.reduce((sum, review) => sum + (review.rating ?? 0), 0);
    const averageRating = ratedReviews.length ? totalRating / ratedReviews.length : 0;

    return reviews.reduce<ReviewStats>(
      (stats, review) => {
        stats.total += 1;
        stats.pending += review.status === 'pending' ? 1 : 0;
        stats.published += review.status === 'published' ? 1 : 0;
        stats.hidden += review.status === 'hidden' ? 1 : 0;
        stats.fiveStars += review.rating === 5 ? 1 : 0;
        stats.withReply += review.admin_reply ? 1 : 0;

        return stats;
      },
      {
        total: 0,
        pending: 0,
        published: 0,
        hidden: 0,
        averageRating: Number(averageRating.toFixed(1)),
        fiveStars: 0,
        withReply: 0,
      }
    );
  }

  private async updateReview(reviewId: string, payload: ReviewUpdatePayload): Promise<void> {
    const { error } = await this.supabase
      .from('reviews')
      .update(payload)
      .eq('id', reviewId);

    if (error) {
      throw new Error(`Unable to update review. ${error.message}`);
    }
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
      product: this.firstRelation(review.products),
      customer: this.firstRelation(review.profiles),
    };
  }

  private firstRelation<T>(relation: ReviewRelation<T> | undefined): T | null {
    if (Array.isArray(relation)) {
      return relation[0] ?? null;
    }

    return relation ?? null;
  }
}
