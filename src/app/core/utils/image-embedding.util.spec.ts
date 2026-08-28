import { DINO_EMBEDDING_DIMENSION } from '../config';
import { normalizeEmbedding, validateImageSearchFile } from './image-embedding.util';

describe('image embedding utilities', () => {
  it('accepts supported image files and rejects unsupported or oversized files', () => {
    expect(validateImageSearchFile(new File(['image'], 'item.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(validateImageSearchFile(new File(['image'], 'item.png', { type: 'image/png' }))).toBeNull();
    expect(validateImageSearchFile(new File(['image'], 'item.webp', { type: 'image/webp' }))).toBeNull();
    expect(
      validateImageSearchFile(
        new File([new Uint8Array(5 * 1024 * 1024)], 'maximum.jpg', { type: 'image/jpeg' }),
      ),
    ).toBeNull();
    expect(validateImageSearchFile(new File(['text'], 'item.txt', { type: 'text/plain' }))).toBe('invalid-type');
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', {
      type: 'image/jpeg',
    });
    expect(validateImageSearchFile(oversized)).toBe('too-large');
  });

  it('returns an L2-normalized 384-dimensional vector', () => {
    const normalized = normalizeEmbedding(new Float32Array(DINO_EMBEDDING_DIMENSION).fill(2));
    expect(normalized).toHaveLength(DINO_EMBEDDING_DIMENSION);
    const magnitude = Math.sqrt(normalized.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });

  it('rejects vectors with the wrong dimension', () => {
    expect(() => normalizeEmbedding([1, 2, 3])).toThrow(/384/);
  });
});
