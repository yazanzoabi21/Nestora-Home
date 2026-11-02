import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { appConfig } from '../../../app.config';
import { AnalyticsChart } from './analytics-chart';
import { AnalyticsChartConfig } from './analytics-chart.model';

describe('AnalyticsChart application initialization', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsChart],
      // Use production providers: a test-only Highcharts provider would mask
      // an incorrect application/route injector scope.
      providers: [...appConfig.providers, provideTranslateService()],
    }).compileComponents();
  });

  it.each([
    { type: 'line' as const, height: 315 },
    { type: 'column' as const, height: 320 },
    { type: 'pie' as const, height: 280 },
  ])('renders a $type SVG after loading and updates the existing chart', async ({ type, height }) => {
    const fixture = TestBed.createComponent(AnalyticsChart);
    const element: HTMLElement = fixture.nativeElement;
    const config: AnalyticsChartConfig = {
      title: 'Chart', height,
      chartOptions: {
        chart: { type, height, animation: false },
        title: { text: 'Initial chart' },
        plotOptions: { series: { animation: false }, pie: { innerSize: '66%' } },
        // Exercise the real renderer without introducing sample business data.
        series: [{ type, data: [] }],
      },
    };
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('config', config);
    await fixture.whenStable();
    expect(element.querySelector('highcharts-chart')).toBeNull();

    fixture.componentRef.setInput('loading', false);
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(element.querySelector('svg.highcharts-root')).not.toBeNull();
    }, { timeout: 5000 });
    const svg = element.querySelector('svg.highcharts-root');
    expect(svg?.getAttribute('height')).toBe(String(height));
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(0);

    fixture.componentRef.setInput('config', {
      ...config,
      chartOptions: { ...config.chartOptions, title: { text: 'Updated chart' } },
    });
    await fixture.whenStable();
    await vi.waitFor(() => expect(element.querySelector('.highcharts-title')?.textContent).toBe('Updated chart'));
    expect(element.querySelector('svg.highcharts-root')).toBe(svg);

    // JSDOM has no layout engine. Supply container measurements so the real
    // Highcharts resize handler can be exercised at mobile/tablet/desktop sizes.
    const host = element.querySelector('highcharts-chart')!;
    let containerWidth = 0;
    Object.defineProperties(host, {
      offsetWidth: { get: () => containerWidth },
      scrollWidth: { get: () => containerWidth },
    });
    for (const width of [390, 768, 1440]) {
      containerWidth = width;
      window.dispatchEvent(new Event('resize'));
      await vi.waitFor(() => expect(svg?.getAttribute('width')).toBe(String(width)));
      expect(svg?.getAttribute('height')).toBe(String(height));
    }
    fixture.destroy();
    expect(element.querySelector('svg.highcharts-root')).toBeNull();
  }, 15000);
});
