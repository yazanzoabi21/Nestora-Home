export type ProductImageEmbeddingState = 'indexed' | 'missing' | 'stale' | 'no-image';

export interface ProductImageEmbeddingStatus {
  readonly productId: string;
  readonly imageUrl: string | null;
  readonly indexedImageUrl: string | null;
  readonly state: ProductImageEmbeddingState;
}

export interface ProductImageEmbeddingIndexSummary {
  readonly total: number;
  readonly indexed: number;
  readonly missing: number;
  readonly stale: number;
  readonly withoutImage: number;
}

export interface ProductImageSearchMatch {
  readonly productId: string;
  readonly similarity: number;
}

export interface ProductImageIndexFailure {
  readonly productId: string;
  readonly message: string;
}

