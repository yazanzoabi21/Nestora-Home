import { CustomerProduct } from '../models';
import { filterImageSearchMatches } from '../../../data-access/services/product-image-embedding.service';
import {
  hasImageSearchResults,
  isCurrentImageSearchRequest,
  preserveImageSearchRanking,
} from './customer-image-search.service';

const product = (id: string, isActive = true): CustomerProduct => ({
  id,
  name: id,
  brand: 'Nestora',
  category: 'Home',
  imageUrl: '/image.jpg',
  price: 10,
  rating: 0,
  reviewCount: 0,
  isFeatured: false,
  isNew: false,
  isActive,
  isLoyaltyEligible: true,
  soldCount: 0,
  inStock: true,
  stock: 1,
});

describe('customer image search mapping', () => {
  it('preserves RPC similarity ranking and excludes unsafe inactive products', () => {
    const products = [product('first'), product('second'), product('inactive', false)];
    const ranked = preserveImageSearchRanking(products, [
      { productId: 'second', similarity: 0.9 },
      { productId: 'inactive', similarity: 0.85 },
      { productId: 'first', similarity: 0.8 },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['second', 'first']);
  });

  it('treats an empty threshold-filtered match list as no results', () => {
    const matches = filterImageSearchMatches(
      [{ productId: 'first', similarity: 0.44 }],
      0.45,
      10,
    );
    expect(hasImageSearchResults(matches)).toBe(false);
    expect(hasImageSearchResults([{ productId: 'first', similarity: 0.5 }])).toBe(true);
  });

  it('prevents stale or closed dialog requests from updating results', () => {
    expect(isCurrentImageSearchRequest(2, 2, true)).toBe(true);
    expect(isCurrentImageSearchRequest(1, 2, true)).toBe(false);
    expect(isCurrentImageSearchRequest(2, 2, false)).toBe(false);
  });
});
