import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type Section = 'products' | 'categories' | 'promotions' | 'offers';

const affected: Readonly<Record<string, readonly Section[]>> = {
  products: ['products', 'categories'],
  product_variants: ['products'],
  categories: ['products', 'categories'],
  promotions: ['promotions'],
  promotion_products: ['promotions'],
  discounts: ['offers'],
  discount_gift_products: ['offers'],
  customer_offers: ['offers'],
  'rpc/replace_promotion_products': ['promotions'],
  'rpc/replace_product_variants': ['products'],
  'rpc/update_inventory_stock': ['products'],
  'rpc/replace_discount_gift_products': ['offers'],
};

@Injectable({ providedIn: 'root' })
export class PublicCatalogChanges {
  private readonly revisions = signal({ products: 0, categories: 0, promotions: 0, offers: 0 });
  readonly revision = this.revisions.asReadonly();
  private readonly channel = typeof BroadcastChannel === 'undefined'
    ? null : new BroadcastChannel('nestora-public-catalog-changes');

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') this.invalidate(event.data);
    });
    inject(DestroyRef).onDestroy(() => this.channel?.close());
  }

  mutationCompleted(path: string, method: string): void {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase())) return;
    const resource = path.replace(/^\/rest\/v1\//, '');
    if (!this.invalidate(resource)) return;
    this.channel?.postMessage(resource);
  }

  private invalidate(resource: string): boolean {
    if (!Object.hasOwn(affected, resource)) return false;
    this.revisions.update((current) => {
      const next = { ...current };
      for (const section of affected[resource]) next[section]++;
      return next;
    });
    return true;
  }
}
