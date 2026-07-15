import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProductCardComponent } from '../../components/customer-product-card';
import { CustomerProductFiltersComponent } from '../../components/customer-product-filters';
import { CustomerProductQuickViewComponent } from '../../components/customer-product-quick-view';
import { NewArrivalsService } from '../../services';
import { ProductBrowserPage } from '../product-browser-page';

@Component({
  selector: 'app-new-arrivals', standalone: true,
  imports: [CustomerProductCardComponent, CustomerProductFiltersComponent, CustomerProductQuickViewComponent, RouterLink, TranslatePipe],
  templateUrl: '../all-products/all-products.html', styleUrl: './new-arrivals.css',
})
export class NewArrivalsComponent extends ProductBrowserPage {
  override readonly titleKey = 'CUSTOMER.PRODUCTS.NEW_ARRIVALS';
  private readonly catalog = inject(NewArrivalsService);
  constructor() { super(); void this.load(); }
  private async load(): Promise<void> {
    try { this.products.set(await this.catalog.getNewArrivals()); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to load new arrivals.'); }
    finally { this.loading.set(false); }
  }
}
