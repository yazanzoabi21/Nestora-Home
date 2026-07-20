import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProductCardComponent } from '../../components/customer-product-card';
import { CustomerProductQuickViewComponent } from '../../components/customer-product-quick-view';
import { NewArrivalsService } from '../../services';
import { ProductBrowserPage } from '../product-browser-page';

@Component({
  selector: 'app-new-arrivals', standalone: true,
  imports: [CustomerProductCardComponent, CustomerProductQuickViewComponent, RouterLink, TranslatePipe],
  templateUrl: './new-arrivals.html',
  styleUrls: ['../all-products/all-products.css', './new-arrivals.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewArrivalsComponent extends ProductBrowserPage {
  override readonly titleKey = 'CUSTOMER.PRODUCTS.NEW_ARRIVALS';
  override readonly filtersEnabled = false;
  private readonly catalog = inject(NewArrivalsService);
  constructor() { super(); void this.load(); }
  private async load(): Promise<void> {
    try { this.products.set(await this.catalog.getNewArrivals()); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to load new arrivals.'); }
    finally { this.loading.set(false); }
  }
}
