import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerNewsletterService } from './customer-newsletter.service';

describe('CustomerNewsletterService', () => {
  const insert = vi.fn();
  const from = vi.fn(() => ({ insert }));
  let service: CustomerNewsletterService;

  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    from.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: CUSTOMER_SUPABASE, useValue: { from } },
    ] });
    service = TestBed.inject(CustomerNewsletterService);
  });

  it('normalizes an email and saves without requesting private subscriber rows', async () => {
    await service.subscribe('  Reader@Example.com  ');
    expect(from).toHaveBeenCalledWith('newsletter_subscriptions');
    expect(insert).toHaveBeenCalledWith({ email: 'reader@example.com' });
  });

  it('accepts an existing subscription without updating it', async () => {
    insert.mockResolvedValue({ error: { code: '23505' } });
    await expect(service.subscribe('reader@example.com')).resolves.toBeUndefined();
  });

  it('propagates database permission and availability errors', async () => {
    const error = { code: '42501', message: 'Permission denied' };
    insert.mockResolvedValue({ error });
    await expect(service.subscribe('reader@example.com')).rejects.toEqual(error);
  });
});
