import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  MediaAsset,
  MediaAssetPayload,
  MediaCategory,
  MediaFileType,
  MediaLibraryStats,
  MediaUsage,
  MediaUsagePayload,
} from '../models';

const MEDIA_ASSET_SELECT = `
  id,
  file_name,
  original_name,
  file_url,
  storage_path,
  bucket_name,
  mime_type,
  file_type,
  file_size,
  width,
  height,
  category,
  alt_text,
  title,
  description,
  is_active,
  is_deleted,
  uploaded_by,
  created_at,
  updated_at
`;

const MEDIA_USAGE_SELECT = `
  id,
  media_id,
  entity_type,
  entity_id,
  usage_type,
  sort_order,
  is_primary,
  created_at
`;

const MEDIA_BUCKET = 'media-library';
const MAX_MEDIA_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

@Injectable({
  providedIn: 'root',
})
export class MediaLibraryService {
  private readonly supabase = inject(SupabaseService).client;

  async getMediaAssets(): Promise<MediaAsset[]> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .select(MEDIA_ASSET_SELECT)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as MediaAsset[];
  }

  async getMediaAssetsByCategory(category: MediaCategory): Promise<MediaAsset[]> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .select(MEDIA_ASSET_SELECT)
      .eq('category', category)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as MediaAsset[];
  }

  async getMediaAssetById(id: string): Promise<MediaAsset | null> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .select(MEDIA_ASSET_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as MediaAsset | null) ?? null;
  }

  async uploadMediaFile(file: File, category: MediaCategory): Promise<MediaAsset> {
    this.validateMediaFile(file);

    const fileType = this.detectFileType(file);
    const dimensions = await this.getImageDimensions(file);
    const fileName = this.safeFileName(file.name);
    const storagePath = `${category}/${new Date().getFullYear()}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage.from(MEDIA_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = this.supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

    if (!data.publicUrl) {
      throw new Error('Unable to get uploaded media URL.');
    }

    return this.createMediaAsset({
      file_name: fileName,
      original_name: file.name,
      file_url: data.publicUrl,
      storage_path: storagePath,
      bucket_name: MEDIA_BUCKET,
      mime_type: file.type || null,
      file_type: fileType,
      file_size: file.size,
      width: dimensions.width,
      height: dimensions.height,
      category,
      alt_text: null,
      title: this.fileTitle(file.name),
      description: null,
      is_active: true,
    });
  }

  async createMediaAsset(payload: MediaAssetPayload): Promise<MediaAsset> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .insert(payload)
      .select(MEDIA_ASSET_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as MediaAsset;
  }

  async updateMediaAsset(id: string, payload: Partial<MediaAssetPayload>): Promise<MediaAsset> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .update(payload)
      .eq('id', id)
      .select(MEDIA_ASSET_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as MediaAsset;
  }

  async softDeleteMediaAsset(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('media_assets')
      .update({ is_deleted: true, is_active: false })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteMediaAsset(id: string): Promise<void> {
    const asset = await this.getMediaAssetById(id);

    if (asset?.storage_path) {
      const { error: storageError } = await this.supabase.storage.from(asset.bucket_name ?? MEDIA_BUCKET).remove([asset.storage_path]);

      if (storageError) {
        throw new Error(storageError.message);
      }
    }

    const { error } = await this.supabase.from('media_assets').delete().eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async createMediaUsage(payload: MediaUsagePayload): Promise<MediaUsage> {
    const { data, error } = await this.supabase
      .from('media_usages')
      .insert({
        sort_order: null,
        is_primary: false,
        ...payload,
      })
      .select(MEDIA_USAGE_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as MediaUsage;
  }

  async setPrimaryMediaUsage(payload: MediaUsagePayload): Promise<MediaUsage> {
    const { error: deleteError } = await this.supabase
      .from('media_usages')
      .delete()
      .eq('entity_type', payload.entity_type)
      .eq('entity_id', payload.entity_id)
      .eq('usage_type', payload.usage_type)
      .eq('is_primary', true);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return this.createMediaUsage({
      ...payload,
      sort_order: 0,
      is_primary: true,
    });
  }

  async deleteMediaUsage(id: string): Promise<void> {
    const { error } = await this.supabase.from('media_usages').delete().eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async getUsagesForMedia(mediaId: string): Promise<MediaUsage[]> {
    const { data, error } = await this.supabase
      .from('media_usages')
      .select(MEDIA_USAGE_SELECT)
      .eq('media_id', mediaId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as MediaUsage[];
  }

  async copyMediaUrl(media: MediaAsset): Promise<void> {
    await navigator.clipboard.writeText(media.file_url);
  }

  getStatsFromAssets(assets: MediaAsset[]): MediaLibraryStats {
    return assets.reduce<MediaLibraryStats>(
      (stats, asset) => {
        stats.totalFiles += 1;
        stats.totalSizeBytes += asset.file_size ?? 0;
        stats.productImages += asset.category === 'product' ? 1 : 0;
        stats.marketingAssets += asset.category === 'promotion' ? 1 : 0;
        stats.brandAssets += asset.category === 'brand' ? 1 : 0;
        return stats;
      },
      {
        totalFiles: 0,
        totalSizeBytes: 0,
        productImages: 0,
        marketingAssets: 0,
        brandAssets: 0,
      }
    );
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) {
      return '0 KB';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  detectFileType(file: File): MediaFileType {
    if (file.type.startsWith('image/')) {
      if (file.name.toLowerCase().includes('logo')) {
        return 'logo';
      }

      if (file.name.toLowerCase().includes('banner')) {
        return 'banner';
      }

      if (file.name.toLowerCase().includes('avatar')) {
        return 'avatar';
      }

      return 'image';
    }

    if (file.type.startsWith('video/')) {
      return 'video';
    }

    if (file.type.includes('pdf') || file.type.includes('document')) {
      return 'document';
    }

    return 'other';
  }

  getImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
    if (!file.type.startsWith('image/')) {
      return Promise.resolve({ width: null, height: null });
    }

    return new Promise((resolve) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: null, height: null });
      };

      image.src = url;
    });
  }

  private validateMediaFile(file: File): void {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error('MEDIA_LIBRARY.ERRORS.INVALID_TYPE');
    }

    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      throw new Error('MEDIA_LIBRARY.ERRORS.MAX_SIZE');
    }
  }

  private safeFileName(fileName: string): string {
    const extension = this.fileExtension(fileName);
    const baseName = fileName
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return `${baseName || 'media'}-${Date.now()}-${this.randomId()}.${extension}`;
  }

  private fileTitle(fileName: string): string {
    return fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  private fileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() || 'bin';
  }

  private randomId(): string {
    return Math.random().toString(36).slice(2, 10);
  }
}
