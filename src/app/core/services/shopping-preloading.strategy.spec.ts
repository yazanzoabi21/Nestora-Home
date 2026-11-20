import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ShoppingPreloadingStrategy } from './shopping-preloading.strategy';

describe('ShoppingPreloadingStrategy', () => {
  function configure(connection = {}, onLine = true): ShoppingPreloadingStrategy {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: { navigator: { connection, onLine } } } }],
    });
    return TestBed.inject(ShoppingPreloadingStrategy);
  }

  it('leaves unmarked routes unloaded and loads opted-in route code', async () => {
    const strategy = configure();
    const load = vi.fn(() => of('code'));
    await firstValueFrom(strategy.preload({ path: 'admin' }, load), { defaultValue: null });
    expect(load).not.toHaveBeenCalled();
    expect(await firstValueFrom(strategy.preload({ data: { preload: true } }, load))).toBe('code');
  });

  for (const preferences of [
    { connection: { saveData: true }, onLine: true },
    { connection: { effectiveType: '2g' }, onLine: true },
    { connection: {}, onLine: false },
  ]) {
    it(`avoids speculative traffic for ${JSON.stringify(preferences)}`, async () => {
      const strategy = configure(preferences.connection, preferences.onLine);
      const load = vi.fn(() => of('code'));
      await firstValueFrom(strategy.preload({ data: { preload: true } }, load), { defaultValue: null });
      expect(load).not.toHaveBeenCalled();
    });
  }

  it('allows later preloads after a failed speculative chunk request', async () => {
    const strategy = configure();
    const route = { data: { preload: true } };
    await firstValueFrom(strategy.preload(route, () => throwError(() => new Error('offline'))), { defaultValue: null });
    expect(await firstValueFrom(strategy.preload(route, () => of('retry')))).toBe('retry');
  });
});
