export interface Category {
  id: string;
  name: string;
  slug: string | null;
  description?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  created_at?: string | null;
}
