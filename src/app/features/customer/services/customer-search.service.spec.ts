import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerSearchService } from './customer-search.service';

describe('CustomerSearchService request lifecycle', () => {
  const rpc = vi.fn();
  let service: CustomerSearchService;

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_SUPABASE, useValue: { rpc } }],
    });
    service = TestBed.inject(CustomerSearchService);
  });

  it('shares concurrent normalized queries and caches empty results', async () => {
    const first = service.search('  home  decor ', 'en');
    const second = service.search('home decor', 'en');
    await Promise.all([first, second]);
    await service.search('HOME DECOR', 'en');
    expect(rpc).toHaveBeenCalledTimes(1);
    await service.search('home decor', 'ar');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a failed request', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(service.search('home', 'en')).rejects.toThrow('offline');
    await expect(service.search('home', 'en')).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('avoids requests for queries shorter than two characters', async () => {
    await expect(service.search(' a ', 'en')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
