import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AnalyticsService } from '../../../data-access/services';
import { AnalyticsComponent } from './analytics';

describe('Analytics', () => {
  const load = vi.fn<AnalyticsService['refreshAnalyticsByPeriod']>();

  beforeEach(async () => {
    load.mockReset().mockResolvedValue(null);
    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        provideTranslateService(),
        { provide: AnalyticsService, useValue: { refreshAnalyticsByPeriod: load } },
      ],
    }).compileComponents();
  });

  it('loads the selected period without contacting Supabase', async () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    await fixture.whenStable();
    expect(load).toHaveBeenCalledWith('12M');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('shows an error and clears loading when the request fails', async () => {
    load.mockRejectedValue(new Error('Network unavailable'));
    const fixture = TestBed.createComponent(AnalyticsComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe('ANALYTICS.TOAST.LOAD_FAILED_DETAIL');
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
