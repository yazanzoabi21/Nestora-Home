import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CustomerNavbarComponent } from '../customer-navbar/customer-navbar.component';

@Component({
  selector: 'app-customer-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, CustomerNavbarComponent],
  templateUrl: './customer-layout.component.html',
  styleUrl: './customer-layout.component.scss',
})
export class CustomerLayoutComponent {}
