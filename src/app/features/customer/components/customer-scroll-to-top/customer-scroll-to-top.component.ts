import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  NgZone,
  computed,
  inject,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-customer-scroll-to-top',
  standalone: true,
  templateUrl: './customer-scroll-to-top.component.html',
  styleUrl: './customer-scroll-to-top.component.scss',
  host: {
    '[class.customer-scroll-to-top-host--visible]': 'visible()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerScrollToTopComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly visibilityThreshold = 250;
  private animationFrameId: number | null = null;

  private readonly progressState = signal(0);
  private readonly visibleState = signal(false);

  readonly progress = this.progressState.asReadonly();
  readonly visible = this.visibleState.asReadonly();
  readonly circleRadius = 20;
  readonly circumference = 2 * Math.PI * this.circleRadius;
  readonly progressOffset = computed(
    () => this.circumference * (1 - this.progress()),
  );

  constructor() {
    const windowRef = this.document.defaultView;
    if (!windowRef) return;

    this.ngZone.runOutsideAngular(() => {
      const requestUpdate = (): void => this.scheduleUpdate(windowRef);

      windowRef.addEventListener('scroll', requestUpdate, { passive: true });
      windowRef.addEventListener('resize', requestUpdate, { passive: true });
      this.scheduleUpdate(windowRef);

      this.destroyRef.onDestroy(() => {
        windowRef.removeEventListener('scroll', requestUpdate);
        windowRef.removeEventListener('resize', requestUpdate);
        if (this.animationFrameId !== null) {
          windowRef.cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
      });
    });
  }

  scrollToTop(): void {
    const windowRef = this.document.defaultView;
    if (!windowRef) return;

    const reduceMotion = windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches;
    windowRef.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }

  private scheduleUpdate(windowRef: Window): void {
    if (this.animationFrameId !== null) return;

    this.animationFrameId = windowRef.requestAnimationFrame(() => {
      this.animationFrameId = null;
      this.updateScrollState(windowRef);
    });
  }

  private updateScrollState(windowRef: Window): void {
    const scrollY = Math.max(0, windowRef.scrollY);
    const scrollableHeight = Math.max(
      0,
      this.document.documentElement.scrollHeight - windowRef.innerHeight,
    );
    const progress = scrollableHeight > 0 ? scrollY / scrollableHeight : 0;
    const clampedProgress = Math.min(1, Math.max(0, progress));

    if (Math.abs(this.progressState() - clampedProgress) >= 0.001) {
      this.progressState.set(clampedProgress);
    }
    this.visibleState.set(scrollY > this.visibilityThreshold);
  }
}
