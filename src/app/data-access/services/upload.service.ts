import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';

const PRODUCT_IMAGES_BUCKET = 'product-images';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private readonly supabase = inject(SupabaseService).client;

  async uploadProductImage(file: File): Promise<string> {
    this.validateImage(file);

    const path = `products/${Date.now()}-${this.randomId()}-${this.sanitizeFileName(file.name)}`;
    const { error } = await this.supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = this.supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);

    if (!data.publicUrl) {
      throw new Error('Unable to get uploaded image URL.');
    }

    return data.publicUrl;
  }

  private validateImage(file: File): void {
    if (!file) {
      throw new Error('No image file selected.');
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error('Unsupported image type.');
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image size exceeds 5MB.');
    }
  }

  private randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2, 12);
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-');
  }
}
