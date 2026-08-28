import { Injectable, inject, isDevMode } from '@angular/core';

import {
  DINO_EMBEDDING_DIMENSION,
  DINO_EMBEDDING_VERSION,
  DINO_MODEL_ID,
  IMAGE_SEARCH_MATCH_LIMIT,
  IMAGE_SEARCH_MINIMUM_SIMILARITY,
} from '../../core/config';
import { VisualSearchError } from '../../core/models/dino-worker.model';
import { ADMIN_SUPABASE, CUSTOMER_SUPABASE } from '../../core/tokens';
import {
  ProductImageEmbeddingState,
  ProductImageEmbeddingStatus,
  ProductImageSearchMatch,
} from '../models';

interface ProductImageEmbeddingStatusRow {
  readonly product_id: string;
  readonly image_url: string | null;
  readonly indexed_image_url: string | null;
  readonly index_state: string;
}

interface ProductImageSearchMatchRow {
  readonly product_id: string;
  readonly similarity: number | string;
}

@Injectable({ providedIn: 'root' })
export class ProductImageEmbeddingService {
  private readonly adminSupabase = inject(ADMIN_SUPABASE);
  private readonly customerSupabase = inject(CUSTOMER_SUPABASE);

  async getIndexStatuses(): Promise<ProductImageEmbeddingStatus[]> {
    const { data, error } = await this.adminSupabase.rpc('get_product_image_embedding_status');
    if (error) throw new Error(error.message);
    return ((data ?? []) as ProductImageEmbeddingStatusRow[]).flatMap((row) => {
      const state = this.embeddingState(row.index_state);
      return state
        ? [{
            productId: row.product_id,
            imageUrl: row.image_url,
            indexedImageUrl: row.indexed_image_url,
            state,
          }]
        : [];
    });
  }

  async upsert(productId: string, imageUrl: string, embedding: readonly number[]): Promise<void> {
    this.assertEmbedding(embedding);
    const { error } = await this.adminSupabase.rpc('upsert_product_image_embedding', {
      p_product_id: productId,
      p_image_url: imageUrl,
      p_embedding: embedding,
      p_model: DINO_MODEL_ID,
      p_embedding_version: DINO_EMBEDDING_VERSION,
    });
    if (error) throw new Error(error.message);
  }

  async remove(productId: string): Promise<void> {
    const { error } = await this.adminSupabase.rpc('delete_product_image_embedding', {
      p_product_id: productId,
    });
    if (error) throw new Error(error.message);
  }

  async search(
    embedding: readonly number[],
    matchCount = IMAGE_SEARCH_MATCH_LIMIT,
    minimumSimilarity = IMAGE_SEARCH_MINIMUM_SIMILARITY,
  ): Promise<ProductImageSearchMatch[]> {
    this.assertEmbedding(embedding);
    const requestId = crypto.randomUUID();
    if (isDevMode()) console.info('[VisualSearch] RPC started', { requestId });
    const { data, error } = await this.customerSupabase.rpc('search_products_by_image', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: matchCount,
      minimum_similarity: minimumSimilarity,
    });
    if (error) {
      throw new VisualSearchError({
        code: 'RPC_FAILED',
        stage: 'rpc',
        message: 'The image similarity search failed.',
        originalError: `${error.code ?? 'RPC'}: ${error.message}`,
      });
    }
    const matches = ((data ?? []) as ProductImageSearchMatchRow[]).flatMap((row) => {
      const similarity = Number(row.similarity);
      return row.product_id && Number.isFinite(similarity)
        ? [{ productId: row.product_id, similarity }]
        : [];
    });
    const filtered = filterImageSearchMatches(matches, minimumSimilarity, matchCount);
    if (isDevMode()) {
      console.info(`[VisualSearch] RPC returned ${filtered.length} matches`, { requestId });
    }
    return filtered;
  }

  async getCompatibleIndexCount(): Promise<number | null> {
    const { data, error } = await this.customerSupabase.rpc(
      'get_customer_image_search_index_count',
    );
    if (error?.code === 'PGRST202' || error?.code === '42883') return null;
    if (error) {
      throw new VisualSearchError({
        code: 'RPC_FAILED',
        stage: 'index-status',
        message: 'Unable to check the visual-search index.',
        originalError: `${error.code ?? 'RPC'}: ${error.message}`,
      });
    }
    const count = Number(data);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new VisualSearchError({
        code: 'RPC_FAILED',
        stage: 'index-status',
        message: 'The visual-search index returned an invalid count.',
      });
    }
    return count;
  }

  private assertEmbedding(embedding: readonly number[]): void {
    if (
      embedding.length !== DINO_EMBEDDING_DIMENSION ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Image embedding must contain ${DINO_EMBEDDING_DIMENSION} finite values.`);
    }
  }

  private embeddingState(value: string): ProductImageEmbeddingState | null {
    return value === 'indexed' || value === 'missing' || value === 'stale' || value === 'no-image'
      ? value
      : null;
  }
}

export function filterImageSearchMatches(
  matches: readonly ProductImageSearchMatch[],
  minimumSimilarity: number,
  matchCount: number,
): ProductImageSearchMatch[] {
  return matches
    .filter((match) => match.similarity >= minimumSimilarity)
    .slice(0, Math.max(0, matchCount));
}
