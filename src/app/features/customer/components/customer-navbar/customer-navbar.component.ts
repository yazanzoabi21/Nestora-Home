import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
  readonly navLinks: CustomerNavLink[] = [
    { label: 'Home', path: '/shop' },
    { label: 'Categories', path: '/shop' },
    { label: 'All Products', path: '/shop' },
    { label: 'New Arrivals', path: '/shop/home' },
  ];
}
