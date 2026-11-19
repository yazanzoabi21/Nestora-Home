import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { OrderEmailVerificationService } from './order-email-verification.service';

describe('OrderEmailVerificationService', () => {
  const invoke = vi.fn();
  let service: OrderEmailVerificationService;

  beforeEach(() => {
    sessionStorage.clear();
    invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [
        OrderEmailVerificationService,
        { provide: CUSTOMER_SUPABASE, useValue: { functions: { invoke } } },
      ],
    });
    service = TestBed.inject(OrderEmailVerificationService);
  });

  it('restores tab-scoped ownership after reload without exposing it in a URL', async () => {
    const orderId = '00000000-0000-4000-8000-000000000001';
    const checkoutToken = '00000000-0000-4000-8000-000000000002';
    invoke.mockResolvedValue({ data: { requested: true }, error: null });
    service.start(orderId, checkoutToken);
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    const restored = TestBed.runInInjectionContext(() => new OrderEmailVerificationService());
    expect(restored.status()).toBe('pending');
    invoke.mockResolvedValue({ data: { verified: true }, error: null });
    await restored.confirm('12345678');
    expect(invoke).toHaveBeenLastCalledWith('order-email-verification', {
      body: { orderId, checkoutToken, action: 'confirm', code: '12345678' },
    });
    expect(sessionStorage.getItem('nestora-order-email-verification')).toBeNull();
  });

  it('keeps checkout synchronous while email verification is pending', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    invoke.mockReturnValue(new Promise((done) => { resolve = done; }));
    expect(service.start('order-id', 'checkout-token')).toBeUndefined();
    expect(service.busy()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('order-email-verification', {
      body: { orderId: 'order-id', checkoutToken: 'checkout-token', action: 'request' },
    });
    resolve({ data: { requested: true }, error: null });
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    expect(service.status()).toBe('pending');
  });

  it('verifies only the placed order using its capability and valid code', async () => {
    invoke.mockResolvedValue({ data: { requested: true }, error: null });
    service.start('order-id', 'checkout-token');
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    await service.confirm('bad');
    expect(service.invalidCode()).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValue({ data: { verified: true }, error: null });
    await service.confirm('12345678');
    expect(service.status()).toBe('verified');
    expect(invoke).toHaveBeenLastCalledWith('order-email-verification', {
      body: { orderId: 'order-id', checkoutToken: 'checkout-token', action: 'confirm', code: '12345678' },
    });
  });

  it('handles an unavailable email service without rejecting checkout', async () => {
    invoke.mockRejectedValue(new Error('SMTP unavailable'));
    service.start('order-id', 'checkout-token');
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    expect(service.status()).toBe('unavailable');
  });
});
