import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
  CustomerReviewEditPayload,
  CustomerReviewPayload,
  Review,
  ReviewCustomerSummary,
  ReviewStatus,
} from '../../../data-access';

const PUBLIC_REVIEW_SELECT = `
  id, product_id, user_id, rating, comment, status, admin_reply, admin_reply_at,
  admin_reply_by, is_liked_by_admin, is_featured, helpful_count, created_at,
  profiles:user_id (id, full_name, avatar_url)
`;

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

@Injectable({ providedIn: 'root' })
export class CustomerReviewsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getPublishedReviewsByProduct(productId: string): Promise<Review[]> {
    const { data, error } = await this.supabase
      .from('reviews')
      .select(PUBLIC_REVIEW_SELECT)
      .eq('product_id', productId)
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) throw new Error('Unable to load reviews.');
    return (data ?? []).map((review) => this.mapReview(review as ReviewRecord));
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
    const { error } = await this.supabase.rpc('submit_product_review', {
      p_product_id: payload.productId,
      p_rating: payload.rating,
      p_comment: payload.comment,
    });

    if (error) {
      throw new Error(error.code === '23505' ? 'REVIEW_ALREADY_EXISTS' : 'REVIEW_SUBMIT_FAILED');
    }
  }

  async updateOwnReview(payload: CustomerReviewEditPayload): Promise<void> {
    const { error } = await this.supabase.rpc('edit_own_product_review', {
      p_review_id: payload.reviewId,
      p_rating: payload.rating,
      p_comment: payload.comment,
    });

    if (error) throw new Error('REVIEW_UPDATE_FAILED');
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
