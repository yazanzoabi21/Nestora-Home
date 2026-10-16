import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ADMIN_SUPABASE, CUSTOMER_SUPABASE } from '../../core/tokens';
import { DINO_EMBEDDING_DIMENSION, IMAGE_SEARCH_MINIMUM_SIMILARITY } from '../../core/config';
import { ProductImageEmbeddingService } from './product-image-embedding.service';

describe('ProductImageEmbeddingService search settings', () => {
  it('forwards the configured threshold and requested result limit to the RPC', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    TestBed.configureTestingModule({ providers: [
      { provide: ADMIN_SUPABASE, useValue: {} },
      { provide: CUSTOMER_SUPABASE, useValue: { rpc } },
    ] });
    const embedding = Array.from({ length: DINO_EMBEDDING_DIMENSION }, (_, i) => i === 0 ? 1 : 0);
    await TestBed.inject(ProductImageEmbeddingService).search(embedding, 5);
    expect(rpc).toHaveBeenCalledWith('search_products_by_image', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: 5,
      minimum_similarity: IMAGE_SEARCH_MINIMUM_SIMILARITY,
    });
  });
});
