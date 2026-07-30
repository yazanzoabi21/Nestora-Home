import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';

@Component({
  selector: 'app-customer-recently-viewed',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, TranslatePipe],
  templateUrl: './customer-recently-viewed.component.html',
  host: {
    class: 'block',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerRecentlyViewedComponent implements AfterViewInit, OnDestroy {
  readonly products = input<readonly CustomerProduct[]>([]);
  readonly eyebrow = input('CUSTOMER.HOME.RECENTLY_VIEWED.EYEBROW');
  readonly title = input('CUSTOMER.HOME.RECENTLY_VIEWED.TITLE');
  readonly maxItems = input(10);
  readonly showClearAction = input(true);
  readonly clearing = input(false);

  readonly clearHistory = output<void>();

  readonly items = computed(() =>
    this.products().slice(0, Math.max(1, Math.trunc(this.maxItems()))),
  );
  readonly rangeStart = signal(0);
  readonly rangeEnd = signal(0);
  readonly canScrollPrevious = signal(false);
  readonly canScrollNext = signal(false);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.items();
      queueMicrotask(() => {
        const element = this.track()?.nativeElement;
        if (element) element.scrollLeft = 0;
        this.updateScrollState();
      });
    });
  }

  ngAfterViewInit(): void {
    const element = this.track()?.nativeElement;
    if (!element || typeof ResizeObserver === 'undefined') {
      this.updateScrollState();
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.updateScrollState());
    this.resizeObserver.observe(element);
    this.updateScrollState();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onScroll(): void {
    this.updateScrollState();
  }

  scrollPrevious(element: HTMLElement): void {
    this.scrollByVisibleGroup(element, -1);
  }

  scrollNext(element: HTMLElement): void {
    this.scrollByVisibleGroup(element, 1);
  }

  private scrollByVisibleGroup(element: HTMLElement, direction: -1 | 1): void {
    const isRtl = getComputedStyle(element).direction === 'rtl';
    let directionFactor = 1;

    if (isRtl) {
      const initialScrollLeft = element.scrollLeft;
      element.scrollLeft = 1;
      directionFactor = element.scrollLeft > 0 ? 1 : -1;
      element.scrollLeft = initialScrollLeft;
    }

    const distance = Math.max(1, element.clientWidth - 24);
    element.scrollLeft =
      element.scrollLeft + direction * directionFactor * distance;
    this.updateScrollState();
  }

  private updateScrollState(): void {
    const element = this.track()?.nativeElement;
    const cards = this.cards(element);

    if (!element || cards.length === 0) {
      this.rangeStart.set(0);
      this.rangeEnd.set(0);
      this.canScrollPrevious.set(false);
      this.canScrollNext.set(false);
      return;
    }

    const trackRect = element.getBoundingClientRect();
    const visibleIndexes = cards.flatMap((card, index) => {
      const cardRect = card.getBoundingClientRect();
      const visibleWidth = Math.max(
        0,
        Math.min(cardRect.right, trackRect.right) -
        Math.max(cardRect.left, trackRect.left),
      );
      const isVisible = visibleWidth >= cardRect.width / 2;
      return isVisible ? [index] : [];
    });
    const firstVisible = visibleIndexes[0] ?? 0;
    const lastVisible = visibleIndexes.at(-1) ?? firstVisible;

    this.rangeStart.set(firstVisible);
    this.rangeEnd.set(lastVisible + 1);
    this.canScrollPrevious.set(firstVisible > 0);
    this.canScrollNext.set(lastVisible < cards.length - 1);
  }

  private cards(element: HTMLElement | undefined): HTMLElement[] {
    return element
      ? Array.from(element.querySelectorAll<HTMLElement>('[data-carousel-card]'))
      : [];
  }
}
