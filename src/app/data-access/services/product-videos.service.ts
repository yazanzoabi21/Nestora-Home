import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import { ProductVideo, ProductVideoRow } from '../models';

const PRODUCT_VIDEOS_BUCKET = 'product-videos';
const PRODUCT_VIDEO_SELECT = `
  id,
  product_id,
  storage_path,
  poster_url,
  sort_order,
  is_active,
  created_at
`;

@Injectable({ providedIn: 'root' })
export class ProductVideosService {
  private readonly supabase = inject(SupabaseService).client;

  async getVideosForProduct(productId: string): Promise<ProductVideo[]> {
    const { data, error } = await this.supabase
      .from('product_videos')
      .select(PRODUCT_VIDEO_SELECT)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapVideo(row as ProductVideoRow));
  }

  async uploadProductVideo(
    productId: string,
    file: File,
    sortOrder: number,
  ): Promise<ProductVideo> {
    const storagePath = `products/${productId}/${this.uniqueFileName(file.name)}`;
    const { error: uploadError } = await this.supabase.storage
      .from(PRODUCT_VIDEOS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await this.supabase
      .from('product_videos')
      .insert({
        product_id: productId,
        storage_path: storagePath,
        poster_url: null,
        sort_order: sortOrder,
        is_active: true,
      })
      .select(PRODUCT_VIDEO_SELECT)
      .single();

    if (error) {
      await this.supabase.storage.from(PRODUCT_VIDEOS_BUCKET).remove([storagePath]);
      throw new Error(error.message);
    }

    return this.mapVideo(data as ProductVideoRow);
  }

  async deleteProductVideo(video: ProductVideo): Promise<void> {
    const { error } = await this.supabase.from('product_videos').delete().eq('id', video.id);
    if (error) throw new Error(error.message);

    const { error: storageError } = await this.supabase.storage
      .from(PRODUCT_VIDEOS_BUCKET)
      .remove([video.storagePath]);
    if (storageError) {
      throw new Error(`Video record removed, but storage cleanup failed: ${storageError.message}`);
    }
  }

  async updateSortOrders(videos: readonly ProductVideo[]): Promise<void> {
    const results = await Promise.all(
      videos.map((video, sortOrder) =>
        this.supabase.from('product_videos').update({ sort_order: sortOrder }).eq('id', video.id),
      ),
    );
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw new Error(failure.message);
  }

  async removeStorageObjects(storagePaths: readonly string[]): Promise<void> {
    if (!storagePaths.length) return;
    const { error } = await this.supabase.storage
      .from(PRODUCT_VIDEOS_BUCKET)
      .remove([...new Set(storagePaths)]);
    if (error) throw new Error(error.message);
  }

  getPublicUrl(storagePath: string): string {
    return this.supabase.storage.from(PRODUCT_VIDEOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  private mapVideo(row: ProductVideoRow): ProductVideo {
    return {
      id: row.id,
      productId: row.product_id,
      storagePath: row.storage_path,
      posterUrl: row.poster_url,
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      url: this.getPublicUrl(row.storage_path),
    };
  }

  private uniqueFileName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || 'mp4';
    const baseName = fileName
      .replace(/\.[^/.]+$/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'video';
    const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${baseName}-${uniqueId}.${extension}`;
  }
}
