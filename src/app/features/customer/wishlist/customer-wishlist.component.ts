import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProductCardComponent } from '../components/customer-product-card';
import { CustomerProduct } from '../models';
import { CustomerShoppingStateService } from '../services';

@Component({
  selector: 'app-customer-wishlist',
  standalone: true,
  imports: [CustomerProductCardComponent, RouterLink, TranslatePipe],
  templateUrl: './customer-wishlist.component.html',
  styleUrl: './customer-wishlist.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerWishlistComponent {
  readonly shopping = inject(CustomerShoppingStateService);

  async toggleWishlist(product: CustomerProduct): Promise<void> {
    await this.shopping.toggleWishlist(product);
  }

  async addToCart(product: CustomerProduct): Promise<void> {
    await this.shopping.addToCart(product);
  }
}
