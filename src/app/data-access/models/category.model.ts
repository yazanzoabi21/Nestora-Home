export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  media_id?: string | null;
  image_url?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  products_count?: number;
  children_count?: number;
}

export interface CategoryMutationPayload {
  parent_id?: string | null;
  name: string;
  slug: string;
  media_id?: string | null;
  image_url?: string | null;
  description?: string | null;
}
