import { vi } from 'vitest';

describe('BFF CSRF recovery', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('shares CSRF across both audiences and concurrent mutations', async () => {
    const { BffApi } = await import('./bff-api');
    const fetcher = vi.fn(async (path: string) => Response.json(path === '/api/csrf'
      ? { csrfToken: 'C'.repeat(43) } : {}));
    vi.stubGlobal('fetch', fetcher);
    await Promise.all([new BffApi('admin').json('auth/login', {}),
      new BffApi('customer').json('auth/login', {}), new BffApi('customer').json('realtime', {})]);
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/csrf')).toHaveLength(1);
  });

  it('bounds failed CSRF requests during an outage and retries after recovery', async () => {
    vi.useFakeTimers();
    const { BffApi } = await import('./bff-api');
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new BffApi('customer');
    await expect(api.json('auth/login', {})).rejects.toMatchObject({ status: 503 });
    await expect(api.json('realtime', {})).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    fetcher.mockImplementation(async (path: string) => Response.json(path === '/api/csrf'
      ? { csrfToken: 'C'.repeat(43) } : {}));
    await expect(api.json('auth/login', {})).resolves.toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('renews stale CSRF once, and never replays a server error', async () => {
    const { BffApi } = await import('./bff-api');
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: 'C'.repeat(43) }))
      .mockResolvedValueOnce(Response.json({ code: 'CSRF_FAILED' }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ csrfToken: 'D'.repeat(43) }))
      .mockResolvedValueOnce(Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new BffApi('customer');
    api.onUnauthorized = vi.fn();
    await expect(api.json('auth/login', {})).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(api.onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not retry an origin mismatch or invalidate an existing session for a rejected login', async () => {
    const { BffApi } = await import('./bff-api');
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: 'C'.repeat(43) }))
      .mockResolvedValueOnce(Response.json({ code: 'ORIGIN_DENIED' }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ code: 'ACCOUNT_NOT_AUTHORIZED' }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new BffApi('admin'); api.onUnauthorized = vi.fn();
    await expect(api.json('auth/login', {})).rejects.toMatchObject({ code: 'ORIGIN_DENIED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(api.json('auth/login', {})).rejects.toMatchObject({ code: 'ACCOUNT_NOT_AUTHORIZED' });
    expect(api.onUnauthorized).not.toHaveBeenCalled();
  });
});
