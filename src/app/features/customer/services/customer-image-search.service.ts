import { Injectable, inject, isDevMode } from '@angular/core';

import { ProductImageEmbeddingService, ProductImageSearchMatch } from '../../../data-access';
import { VisualSearchError } from '../../../core/models/dino-worker.model';
import { CustomerProduct } from '../models';
import { CustomerCatalogService } from './customer-catalog.service';

@Injectable({ providedIn: 'root' })
export class CustomerImageSearchService {
  private readonly embeddings = inject(ProductImageEmbeddingService);
  private readonly catalog = inject(CustomerCatalogService);

  async assertIndexAvailable(): Promise<number | null> {
    const count = await this.embeddings.getCompatibleIndexCount();
    if (count === 0) {
      throw new VisualSearchError({
        code: 'NO_INDEXED_PRODUCTS',
        stage: 'index-status',
        message: 'No indexed products are available yet.',
      });
    }
    return count;
  }

  async search(embedding: readonly number[]): Promise<CustomerProduct[]> {
    const matches = await this.embeddings.search(embedding);
    if (matches.length === 0) return [];
    let products: CustomerProduct[];
    try {
      products = await this.catalog.getProductsByIds(matches.map((match) => match.productId));
    } catch (error: unknown) {
      throw new VisualSearchError({
        code: 'PRODUCT_FETCH_FAILED',
        stage: 'product-fetch',
        message: 'Similar products could not be loaded.',
        originalError: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }, { cause: error });
    }
    if (isDevMode()) console.info('[VisualSearch] products loaded', { count: products.length });
    return preserveImageSearchRanking(products, matches);
  }
}

export function preserveImageSearchRanking(
  products: readonly CustomerProduct[],
  matches: readonly ProductImageSearchMatch[],
): CustomerProduct[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  return matches.flatMap((match) => {
    const product = productsById.get(match.productId);
    return product?.isActive ? [product] : [];
  });
}

export function hasImageSearchResults(matches: readonly ProductImageSearchMatch[]): boolean {
  return matches.length > 0;
}

export function isCurrentImageSearchRequest(
  requestVersion: number,
  currentVersion: number,
  dialogOpen: boolean,
): boolean {
  return requestVersion === currentVersion && dialogOpen;
}
