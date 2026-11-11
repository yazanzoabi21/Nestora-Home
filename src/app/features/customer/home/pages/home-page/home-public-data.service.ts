import { Injectable, inject, signal } from '@angular/core';
import { CategoriesService, CustomerOffersService, PromotionsService } from '../../../../../data-access/services';
import { PublicCatalogChanges } from '../../../../../core/services/public-catalog-changes.service';
import type { Session } from '@supabase/supabase-js';

const MAX_STALE_MS = 5 * 60_000;

function publicSection<T>(
  load: () => Promise<T>, revision: () => number, freshMs: number, cacheable: (data: T) => boolean = () => true,
) {
  const entry = signal<{ data: T; loadedAt: number; revision: number } | null>(null);
  let pending: { revision: number; request: Promise<T | undefined> } | undefined;

  return {
    read(): T | null {
      const current = entry();
      return current && Date.now() - current.loadedAt < MAX_STALE_MS ? current.data : null;
    },
    refresh(force = false): Promise<T | undefined> {
      const version = revision();
      const current = entry();
      if (pending?.revision === version) return pending.request;
      if (!force && current?.revision === version && Date.now() - current.loadedAt < freshMs) {
        return Promise.resolve(current.data);
      }
      const request = load().then((data) => {
        if (revision() !== version) return undefined;
        entry.set(cacheable(data) ? { data, loadedAt: Date.now(), revision: version } : null);
        return data;
      }).catch((error: unknown) => {
        if (revision() === version) throw error;
        return undefined;
      }).finally(() => {
        if (pending?.request === request) pending = undefined;
      });
      pending = { revision: version, request };
      return request;
    },
  };
}

@Injectable({ providedIn: 'root' })
export class HomePublicData {
  private readonly categoriesService = inject(CategoriesService);
  private readonly promotionsService = inject(PromotionsService);
  private readonly offersService = inject(CustomerOffersService);
  private readonly changes = inject(PublicCatalogChanges);

  readonly categoriesRevision = () => this.changes.revision().categories;
  readonly promotionsRevision = () => this.changes.revision().promotions;
  readonly offersRevision = () => this.changes.revision().offers;
  readonly categories = publicSection(
    () => this.categoriesService.getPublicCategoriesWithProductCount(), this.categoriesRevision, 120_000,
  );
  readonly promotions = publicSection(
    () => this.promotionsService.getPublicPromotions(), this.promotionsRevision, 60_000,
  );
  readonly guestOffers = publicSection(
    () => this.offersService.getActiveCustomerOffers(true), this.offersRevision, 60_000,
    (offers) => offers.every(({ audience }) => audience === 'all' || audience === 'guest'),
  );
  private offerSession: Session | null = null;
  private memberOffers = this.createMemberOffers();

  offersFor(session: Session | null) {
    if (this.offerSession !== session) {
      this.offerSession = session;
      this.memberOffers = this.createMemberOffers();
    }
    return session ? this.memberOffers : this.guestOffers;
  }

  private createMemberOffers() {
    return publicSection(() => this.offersService.getActiveCustomerOffers(), this.offersRevision, 30_000);
  }
}
