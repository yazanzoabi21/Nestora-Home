import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

import {
  CustomerProductCardComponent,
  CustomerProductCardSkeleton,
  CustomerProductFiltersComponent,
  CustomerProductQuickViewComponent,
} from '../../components';
import { CustomerCatalogService } from '../../services';
import { ProductBrowserPage } from '../product-browser-page';
import { AdminPaginationComponent } from '../../../../shared/ui/admin-pagination';

@Component({
  selector: 'app-new-arrivals',
  standalone: true,
  imports: [
    CdkTrapFocus,
    FormsModule,
    CustomerProductCardComponent,
    CustomerProductCardSkeleton,
    CustomerProductFiltersComponent,
    CustomerProductQuickViewComponent,
    RouterLink,
    TranslatePipe,
    AdminPaginationComponent
  ],
  templateUrl: './new-arrivals.html',
  styleUrls: [
    '../all-products/all-products.css',
    './new-arrivals.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewArrivalsComponent extends ProductBrowserPage {
  override readonly titleKey = 'CUSTOMER.PRODUCTS.NEW_ARRIVALS';

  private readonly catalog = inject(CustomerCatalogService);

  constructor() {
    super();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.products.set(await this.catalog.getNewArrivals());
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Unable to load new arrivals.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
