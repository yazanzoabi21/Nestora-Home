import { Injectable, inject } from '@angular/core';

import { DinoImageEmbeddingService } from '../../../core/services/dino-image-embedding.service';
import { VisualSearchError } from '../../../core/models/dino-worker.model';
import { resizeImageForEmbedding } from '../../../core/utils/image-embedding.util';
import { ProductImageEmbeddingService } from '../../../data-access';

@Injectable({ providedIn: 'root' })
export class AdminProductImageIndexService {
  private readonly dino = inject(DinoImageEmbeddingService);
  private readonly embeddings = inject(ProductImageEmbeddingService);

  prepare(): void {
    this.dino.prepare();
  }

  getStatuses() {
    return this.embeddings.getIndexStatuses();
  }

  async indexProduct(productId: string, imageUrl: string): Promise<void> {
    await this.saveEmbedding(productId, imageUrl, await this.prepareEmbedding(imageUrl));
  }

  async prepareEmbedding(image: string | Blob): Promise<number[]> {
    let resized: Blob;
    try {
      let source = image;
      if (typeof source === 'string') {
        const response = await fetch(source, {
          mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
        source = await response.blob();
      }
      if (!source.type.startsWith('image/')) throw new Error('Product image response is invalid.');
      resized = await resizeImageForEmbedding(source);
    } catch (error: unknown) {
      throw new VisualSearchError({
        code: 'IMAGE_PREPROCESS_FAILED',
        stage: 'image-preprocess',
        message: 'The product image could not be fetched or prepared. Check its URL and CORS policy.',
        originalError: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }, { cause: error });
    }
    return this.dino.generateEmbedding(resized);
  }

  saveEmbedding(productId: string, imageUrl: string, embedding: number[]): Promise<void> {
    return this.embeddings.upsert(productId, imageUrl, embedding);
  }

  remove(productId: string): Promise<void> {
    return this.embeddings.remove(productId);
  }
}
