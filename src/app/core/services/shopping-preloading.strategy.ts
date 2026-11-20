import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable, catchError } from 'rxjs';

interface ConnectionPreferences {
  saveData?: boolean;
  effectiveType?: string;
}

/** Load only opted-in route code. Components and their data services stay inactive. */
@Injectable({ providedIn: 'root' })
export class ShoppingPreloadingStrategy implements PreloadingStrategy {
  private readonly document = inject(DOCUMENT);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const navigator = this.document.defaultView?.navigator as
      | (Navigator & { connection?: ConnectionPreferences })
      | undefined;
    const connection = navigator?.connection;
    if (
      route.data?.['preload'] !== true || navigator?.onLine === false ||
      connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    ) return EMPTY;

    // A failed speculative load must not stop preloading after later navigations.
    return load().pipe(catchError(() => EMPTY));
  }
}
