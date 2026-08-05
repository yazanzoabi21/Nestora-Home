import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CustomerNavbarComponent } from '../customer-navbar/customer-navbar.component';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-customer-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, CustomerNavbarComponent, TranslatePipe],
  templateUrl: './customer-layout.component.html',
  styleUrl: './customer-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLayoutComponent {}
