export type MediaFileType =
  | 'image'
  | 'video'
  | 'document'
  | 'logo'
  | 'banner'
  | 'avatar'
  | 'other';

export type MediaCategory =
  | 'product'
  | 'category'
  | 'promotion'
  | 'brand'
  | 'avatar'
  | 'review'
  | 'general';

export type MediaEntityType =
  | 'product'
  | 'category'
  | 'promotion'
  | 'profile'
  | 'review'
  | 'order'
  | 'general';

export type MediaUsageType =
  | 'main_image'
  | 'gallery'
  | 'thumbnail'
  | 'banner'
  | 'popup'
  | 'logo'
  | 'avatar'
  | 'attachment'
  | 'other';

export interface MediaAsset {
  id: string;
  file_name: string;
  original_name: string | null;
  file_url: string;
  storage_path: string | null;
  bucket_name: string | null;
  mime_type: string | null;
  file_type: MediaFileType | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  category: MediaCategory | null;
  alt_text: string | null;
  title: string | null;
  description: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
  uploaded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MediaUsage {
  id: string;
  media_id: string;
  entity_type: MediaEntityType;
  entity_id: string;
  usage_type: MediaUsageType;
  sort_order: number | null;
  is_primary: boolean | null;
  created_at: string | null;
}

export interface MediaAssetPayload {
  file_name: string;
  original_name: string | null;
  file_url: string;
  storage_path: string | null;
  bucket_name: string | null;
  mime_type: string | null;
  file_type: MediaFileType;
  file_size: number | null;
  width: number | null;
  height: number | null;
  category: MediaCategory;
  alt_text: string | null;
  title: string | null;
  description: string | null;
  is_active: boolean;
}

export interface MediaUsagePayload {
  media_id: string;
  entity_type: MediaEntityType;
  entity_id: string;
  usage_type: MediaUsageType;
  sort_order?: number | null;
  is_primary?: boolean | null;
}

export interface MediaLibraryStats {
  totalFiles: number;
  totalSizeBytes: number;
  productImages: number;
  marketingAssets: number;
  brandAssets: number;
}
