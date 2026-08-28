export const DINO_MODEL_ID = 'onnx-community/dinov2-small-ONNX';
export const DINO_DTYPE = 'q8' as const;
export const DINO_EMBEDDING_DIMENSION = 384;
export const DINO_EMBEDDING_VERSION = 1;
export const DINO_POOLING_STRATEGY = 'cls-token' as const;

export const IMAGE_SEARCH_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const IMAGE_SEARCH_MAX_WORKING_DIMENSION = 1024;
export const IMAGE_SEARCH_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const IMAGE_SEARCH_MATCH_LIMIT = 10;
export const IMAGE_SEARCH_MINIMUM_SIMILARITY = 0.45;

