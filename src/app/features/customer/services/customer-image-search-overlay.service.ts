import { Injectable, signal } from '@angular/core';
import {
  Event as RouterEvent,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
} from '@angular/router';

import { VisualSearchErrorCode } from '../../../core/models/dino-worker.model';
import { ImageSearchValidationError } from '../../../core/utils/image-embedding.util';
import { CustomerProduct } from '../models';

export type CustomerImageSearchStage = 'select' | 'processing' | 'results' | 'error';

@Injectable({ providedIn: 'root' })
export class CustomerImageSearchOverlayService {
  readonly open = signal(false);
  readonly stage = signal<CustomerImageSearchStage>('select');
  readonly previewUrl = signal<string | null>(null);
  readonly workingImage = signal<Blob | null>(null);
  readonly results = signal<readonly CustomerProduct[]>([]);
  readonly validationError = signal<ImageSearchValidationError>(null);
  readonly searchErrorCode = signal<VisualSearchErrorCode | null>(null);

  private returnUrl: string | null = null;
  private currentUrl = '';
  private departureNavigationId: number | null = null;
  private restorationNavigationId: number | null = null;

  show(): void {
    this.open.set(true);
  }

  dismiss(): void {
    this.open.set(false);
    this.returnUrl = null;
    this.departureNavigationId = null;
    this.restorationNavigationId = null;
    this.clearSession();
  }

  startNewSelection(): void {
    this.returnUrl = null;
    this.departureNavigationId = null;
    this.restorationNavigationId = null;
    this.clearSession();
  }

  setCurrentRoute(url: string): void {
    this.currentUrl = url;
  }

  suspendForProductNavigation(): void {
    if (this.stage() !== 'results' || !this.previewUrl() || this.results().length === 0) return;

    this.returnUrl = this.currentUrl;
    this.departureNavigationId = null;
    this.restorationNavigationId = null;
    this.open.set(false);
  }

  handleRouterEvent(event: RouterEvent): void {
    if (event instanceof NavigationStart) {
      if (
        this.returnUrl !== null &&
        event.navigationTrigger === 'popstate' &&
        event.url === this.returnUrl
      ) {
        this.restorationNavigationId = event.id;
        return;
      }

      if (this.returnUrl !== null && this.departureNavigationId === null) {
        this.departureNavigationId = event.id;
      }
      return;
    }

    if (event instanceof NavigationEnd && event.id === this.restorationNavigationId) {
      this.open.set(true);
      this.returnUrl = null;
      this.departureNavigationId = null;
      this.restorationNavigationId = null;
      return;
    }

    if (
      (event instanceof NavigationCancel || event instanceof NavigationError) &&
      event.id === this.departureNavigationId
    ) {
      this.open.set(true);
      this.returnUrl = null;
      this.departureNavigationId = null;
      this.restorationNavigationId = null;
    }
  }

  private clearSession(): void {
    const previewUrl = this.previewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    this.stage.set('select');
    this.previewUrl.set(null);
    this.workingImage.set(null);
    this.results.set([]);
    this.validationError.set(null);
    this.searchErrorCode.set(null);
  }
}

