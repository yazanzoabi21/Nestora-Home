export type ReviewStatus = 'pending' | 'published' | 'hidden';

export interface ReviewProductSummary {
  id: string;
  name: string;
  slug?: string | null;
  image_url?: string | null;
}

export interface ReviewCustomerSummary {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface Review {
  id: string;
  product_id: string | null;
  user_id: string | null;
  rating: number | null;
  comment: string | null;
  status: ReviewStatus;
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_reply_by: string | null;
  is_liked_by_admin: boolean;
  is_featured: boolean;
  helpful_count: number;
  created_at: string | null;
  product?: ReviewProductSummary | null;
  customer?: ReviewCustomerSummary | null;
}

export interface ReviewStats {
  total: number;
  pending: number;
  published: number;
  hidden: number;
  averageRating: number;
  fiveStars: number;
  withReply: number;
}

export interface ReviewFilters {
  search: string;
  productId: string | null;
  rating: number | null;
  status: ReviewStatus | 'all';
}

export interface ReviewUpdatePayload {
  status?: ReviewStatus;
  admin_reply?: string | null;
  admin_reply_at?: string | null;
  admin_reply_by?: string | null;
  is_liked_by_admin?: boolean;
  is_featured?: boolean;
}
