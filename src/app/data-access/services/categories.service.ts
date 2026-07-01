import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import { Category, CategoryMutationPayload } from '../models';

interface ProductCategoryCountRecord {
  category_id: string | null;
}

interface SupabaseColumnError {
  code?: string;
  message?: string;
}

const CATEGORY_SELECT_WITH_PARENT = `
  id,
  parent_id,
  media_id,
  name,
  slug,
  image_url,
  description,
  created_at
`;

const CATEGORY_SELECT = `
  id,
  media_id,
  name,
  slug,
  image_url,
  description,
  created_at
`;

@Injectable({
  providedIn: 'root',
})
export class CategoriesService {
  private readonly supabase = inject(SupabaseService).client;

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('categories')
      .select(CATEGORY_SELECT_WITH_PARENT)
      .order('created_at', { ascending: false });

    if (this.isMissingParentIdError(error)) {
      return this.getCategoriesWithoutParent();
    }

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((category) => this.mapCategory(category as Category));
  }

  async getCategoryById(id: string): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .select(CATEGORY_SELECT_WITH_PARENT)
      .eq('id', id)
      .single();

    if (this.isMissingParentIdError(error)) {
      const fallback = await this.supabase
        .from('categories')
        .select(CATEGORY_SELECT)
        .eq('id', id)
        .single();

      if (fallback.error) {
        throw new Error(fallback.error.message);
      }

      return this.mapCategory(fallback.data as Category);
    }

    if (error) {
      throw new Error(error.message);
    }

    return this.mapCategory(data as Category);
  }

  async getCategoriesWithProductCount(): Promise<Category[]> {
    const [categories, productCounts] = await Promise.all([
      this.getCategories(),
      this.getProductCountsByCategoryId(),
    ]);

    return categories.map((category) => ({
      ...category,
      products_count: productCounts.get(category.id) ?? 0,
      children_count: categories.filter((candidate) => candidate.parent_id === category.id).length,
    }));
  }

  async createCategory(payload: CategoryMutationPayload): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .insert(this.toCategoryRecord(payload, true))
      .select(CATEGORY_SELECT_WITH_PARENT)
      .single();

    if (this.isMissingParentIdError(error)) {
      return this.createCategoryWithoutParent(payload);
    }

    if (error) {
      throw new Error(error.message);
    }

    return this.mapCategory(data as Category);
  }

  async updateCategory(id: string, payload: CategoryMutationPayload): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .update(this.toCategoryRecord(payload, true))
      .eq('id', id)
      .select(CATEGORY_SELECT_WITH_PARENT)
      .single();

    if (this.isMissingParentIdError(error)) {
      return this.updateCategoryWithoutParent(id, payload);
    }

    if (error) {
      throw new Error(error.message);
    }

    return this.mapCategory(data as Category);
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  createSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private async getCategoriesWithoutParent(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('categories')
      .select(CATEGORY_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((category) => this.mapCategory(category as Category));
  }

  private async createCategoryWithoutParent(payload: CategoryMutationPayload): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .insert(this.toCategoryRecord(payload, false))
      .select(CATEGORY_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapCategory(data as Category);
  }

  private async updateCategoryWithoutParent(id: string, payload: CategoryMutationPayload): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .update(this.toCategoryRecord(payload, false))
      .eq('id', id)
      .select(CATEGORY_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapCategory(data as Category);
  }

  private async getProductCountsByCategoryId(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .from('products')
      .select('category_id');

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).reduce((counts, product) => {
      const categoryId = (product as ProductCategoryCountRecord).category_id;

      if (categoryId) {
        counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
      }

      return counts;
    }, new Map<string, number>());
  }

  private mapCategory(category: Category): Category {
    const name = category.name.trim();

    return {
      ...category,
      parent_id: category.parent_id ?? null,
      media_id: category.media_id ?? null,
      name,
      slug: category.slug || this.createSlug(name),
      image_url: category.image_url ?? null,
      description: category.description ?? null,
      products_count: category.products_count ?? 0,
    };
  }

  private toCategoryRecord(
    payload: CategoryMutationPayload,
    includeParentId: boolean
  ): CategoryMutationPayload {
    const name = payload.name.trim();

    const record: CategoryMutationPayload = {
      name,
      slug: payload.slug?.trim() || this.createSlug(name),
      media_id: payload.media_id ?? null,
      image_url: payload.image_url?.trim() || null,
      description: payload.description?.trim() || null,
    };

    if (includeParentId) {
      record.parent_id = payload.parent_id ?? null;
    }

    return record;
  }

  private isMissingParentIdError(error: SupabaseColumnError | null): boolean {
    return (
      (error?.code === '42703' || error?.code === 'PGRST204') &&
      (error.message?.includes('parent_id') ?? false)
    );
  }
}
