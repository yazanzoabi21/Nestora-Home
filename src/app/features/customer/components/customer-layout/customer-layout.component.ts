import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CustomerNavbarComponent } from '../customer-navbar/customer-navbar.component';
import { CustomerFooterComponent } from '../customer-footer/customer-footer.component';
import { WhatsAppContactComponent } from '../whatsapp-contact/whatsapp-contact.component';
import { CustomerScrollToTopComponent } from '../customer-scroll-to-top/customer-scroll-to-top.component';

@Component({
  selector: 'app-customer-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    CustomerNavbarComponent,
    CustomerFooterComponent,
    WhatsAppContactComponent,
    CustomerScrollToTopComponent,
  ],
  templateUrl: './customer-layout.component.html',
  styleUrl: './customer-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLayoutComponent {}
