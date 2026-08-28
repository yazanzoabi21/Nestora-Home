import {
  DINO_EMBEDDING_DIMENSION,
  IMAGE_SEARCH_ALLOWED_TYPES,
  IMAGE_SEARCH_MAX_FILE_SIZE_BYTES,
  IMAGE_SEARCH_MAX_WORKING_DIMENSION,
} from '../config';

export type ImageSearchValidationError = 'invalid-type' | 'too-large' | null;

export function validateImageSearchFile(file: File): ImageSearchValidationError {
  if (!IMAGE_SEARCH_ALLOWED_TYPES.some((type) => type === file.type)) return 'invalid-type';
  if (file.size > IMAGE_SEARCH_MAX_FILE_SIZE_BYTES) return 'too-large';
  return null;
}

export function normalizeEmbedding(values: ArrayLike<number>): number[] {
  if (values.length !== DINO_EMBEDDING_DIMENSION) {
    throw new Error(`Expected ${DINO_EMBEDDING_DIMENSION} image features.`);
  }

  let squaredMagnitude = 0;
  const embedding = Array.from(values, (value) => {
    if (!Number.isFinite(value)) throw new Error('The image features are invalid.');
    squaredMagnitude += value * value;
    return value;
  });
  const magnitude = Math.sqrt(squaredMagnitude);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new Error('The image features cannot be normalized.');
  }
  return embedding.map((value) => value / magnitude);
}

export async function resizeImageForEmbedding(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      1,
      IMAGE_SEARCH_MAX_WORKING_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare this image.');
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

