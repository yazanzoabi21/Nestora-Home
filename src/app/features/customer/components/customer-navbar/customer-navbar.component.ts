import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CustomerShoppingStateService } from '../../services';

interface CustomerNavLink {
  label: string;
  path: string;
}

@Component({
  selector: 'app-customer-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './customer-navbar.component.html',
  styleUrl: './customer-navbar.component.scss',
})
export class CustomerNavbarComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  readonly navLinks: CustomerNavLink[] = [
    { label: 'Home', path: '/shop' },
    { label: 'Categories', path: '/shop' },
    { label: 'All Products', path: '/shop/products' },
    { label: 'New Arrivals', path: '/shop/new-arrivals' },
  ];
}
