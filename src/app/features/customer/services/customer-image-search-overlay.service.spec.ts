import { NavigationEnd, NavigationStart } from '@angular/router';

import { CustomerProduct } from '../models';
import { CustomerImageSearchOverlayService } from './customer-image-search-overlay.service';

function product(id: string): CustomerProduct {
  return {
    id,
    name: `Product ${id}`,
    brand: 'Nestora',
    category: 'Home',
    imageUrl: '/product.webp',
    price: 10,
    rating: 5,
    reviewCount: 1,
    isFeatured: false,
    isNew: false,
    isActive: true,
    isLoyaltyEligible: false,
    soldCount: 0,
    inStock: true,
    stock: 1,
  };
}

describe('CustomerImageSearchOverlayService', () => {
  let service: CustomerImageSearchOverlayService;

  beforeEach(() => {
    service = new CustomerImageSearchOverlayService();
  });

  it('restores the preserved results only after browser Back returns to the source route', () => {
    const results = [product('a'), product('b')];
    service.previewUrl.set('blob:visual-search');
    service.results.set(results);
    service.stage.set('results');
    service.show();
    service.setCurrentRoute('/shop/products?category=kitchen');

    service.suspendForProductNavigation();
    service.handleRouterEvent(new NavigationStart(1, '/shop/products/a', 'imperative'));
    service.handleRouterEvent(
      new NavigationEnd(1, '/shop/products/a', '/shop/products/a'),
    );

    expect(service.open()).toBe(false);
    expect(service.previewUrl()).toBe('blob:visual-search');
    expect(service.results()).toBe(results);

    service.handleRouterEvent(
      new NavigationStart(2, '/shop/products?category=kitchen', 'popstate', {
        navigationId: 0,
      }),
    );
    expect(service.open()).toBe(false);

    service.handleRouterEvent(
      new NavigationEnd(
        2,
        '/shop/products?category=kitchen',
        '/shop/products?category=kitchen',
      ),
    );

    expect(service.open()).toBe(true);
    expect(service.stage()).toBe('results');
    expect(service.previewUrl()).toBe('blob:visual-search');
    expect(service.results()).toBe(results);

    service.suspendForProductNavigation();

    expect(service.open()).toBe(false);
    expect(service.results()).toBe(results);
  });

  it('clears the session only when it is explicitly dismissed', () => {
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    service.previewUrl.set('blob:visual-search');
    service.results.set([product('a')]);
    service.stage.set('results');
    service.show();

    service.dismiss();

    expect(service.open()).toBe(false);
    expect(service.stage()).toBe('select');
    expect(service.previewUrl()).toBeNull();
    expect(service.results()).toEqual([]);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:visual-search');
  });
});
