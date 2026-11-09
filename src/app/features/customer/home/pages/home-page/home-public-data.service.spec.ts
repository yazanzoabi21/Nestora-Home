import { TestBed } from '@angular/core/testing';
import { PublicCatalogChanges } from '../../../../../core/services/public-catalog-changes.service';
import { CategoriesService, CustomerOffersService, PromotionsService } from '../../../../../data-access/services';
import type { Category } from '../../../../../data-access/models';
import { HomePublicData } from './home-public-data.service';

describe('Home public data', () => {
  it('shares a cold load, serves warm and stale snapshots, and refreshes after an Admin edit', async () => {
    const categories = vi.fn().mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [
      { provide: CategoriesService, useValue: { getPublicCategoriesWithProductCount: categories } },
      { provide: PromotionsService, useValue: { getPublicPromotions: vi.fn() } },
      { provide: CustomerOffersService, useValue: { getActiveCustomerOffers: vi.fn() } },
    ] });
    const cache = TestBed.inject(HomePublicData).categories;
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10_000);
    try {
      expect(cache.read()).toBeNull();
      const cold = cache.refresh();
      expect(cache.refresh()).toBe(cold);
      await cold;
      expect(cache.read()).toEqual([]);
      await cache.refresh();
      expect(categories).toHaveBeenCalledTimes(1);

      now.mockReturnValue(140_000);
      let resolve!: (value: Category[]) => void;
      categories.mockImplementationOnce(() => new Promise<Category[]>((done) => { resolve = done; }));
      const stale = cache.refresh();
      expect(cache.read()).toEqual([]);
      TestBed.inject(PublicCatalogChanges).mutationCompleted('/rest/v1/categories', 'PATCH');
      const fresh: Category[] = [];
      categories.mockResolvedValueOnce(fresh);
      await cache.refresh();
      resolve([]);
      await stale;
      expect(cache.read()).toBe(fresh);
      expect(categories).toHaveBeenCalledTimes(3);

      now.mockReturnValue(500_000);
      expect(cache.read()).toBeNull();
    } finally {
      now.mockRestore();
    }
  });
});
