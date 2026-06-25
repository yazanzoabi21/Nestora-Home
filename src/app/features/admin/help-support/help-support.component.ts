import { Component } from '@angular/core';

import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';

interface QuickAction {
  icon: string;
  label: string;
}

interface SupportChannel {
  icon: string;
  title: string;
  detail: string;
}

interface HelpArticle {
  icon: string;
  title: string;
}

interface TicketStat {
  label: string;
  value: number;
  className: string;
}

interface RecentTicket {
  id: string;
  title: string;
  date: string;
  status: 'Open' | 'Pending' | 'Resolved';
  badgeClass: string;
}

interface FaqCategory {
  icon: string;
  title: string;
}

interface SupportOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-help-support',
  standalone: true,
  imports: [AdminFormFieldComponent],
  templateUrl: './help-support.component.html',
  styleUrl: './help-support.component.css',
})
export class HelpSupportComponent {
  readonly quickActions: QuickAction[] = [
    { icon: 'pi pi-shopping-cart', label: 'Orders' },
    { icon: 'pi pi-box', label: 'Products' },
    { icon: 'pi pi-credit-card', label: 'Payments' },
    { icon: 'pi pi-user', label: 'Account' },
    { icon: 'pi pi-shield', label: 'Security' },
  ];

  readonly supportChannels: SupportChannel[] = [
    {
      icon: 'pi pi-envelope',
      title: 'Email Support',
      detail: 'support@nestora.co.uk',
    },
    {
      icon: 'pi pi-phone',
      title: 'Phone',
      detail: '+44 7700 900123',
    },
    {
      icon: 'pi pi-comments',
      title: 'Live Chat',
      detail: 'Available 9:00 AM - 6:00 PM',
    },
  ];

  readonly helpArticles: HelpArticle[] = [
    { icon: 'pi pi-lock', title: 'How to reset your password' },
    { icon: 'pi pi-users', title: 'Managing admin permissions' },
    { icon: 'pi pi-tag', title: 'Creating promotions and discounts' },
    { icon: 'pi pi-box', title: 'Tracking orders and returns' },
    { icon: 'pi pi-chart-bar', title: 'Understanding analytics reports' },
  ];

  readonly ticketStats: TicketStat[] = [
    { label: 'Open', value: 3, className: 'bg-[#fff1f0] text-[#dc3f35]' },
    { label: 'Pending', value: 2, className: 'bg-[#fff7e6] text-[#b97712]' },
    { label: 'Resolved', value: 18, className: 'bg-[#eef4e8] text-[#5f6f43]' },
  ];

  readonly recentTickets: RecentTicket[] = [
    {
      id: '#TKT-1024',
      title: 'Unable to process refund',
      date: '22 Apr 2026',
      status: 'Open',
      badgeClass: 'bg-[#fff1f0] text-[#dc3f35]',
    },
    {
      id: '#TKT-1023',
      title: 'Product upload issue',
      date: '21 Apr 2026',
      status: 'Pending',
      badgeClass: 'bg-[#fff7e6] text-[#b97712]',
    },
    {
      id: '#TKT-1022',
      title: 'Discount code not working',
      date: '20 Apr 2026',
      status: 'Resolved',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
    {
      id: '#TKT-1021',
      title: 'Analytics report missing data',
      date: '19 Apr 2026',
      status: 'Resolved',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
    {
      id: '#TKT-1020',
      title: 'Login verification not received',
      date: '18 Apr 2026',
      status: 'Resolved',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
  ];

  readonly faqCategories: FaqCategory[] = [
    { icon: 'pi pi-user', title: 'Account & Login' },
    { icon: 'pi pi-credit-card', title: 'Orders & Payments' },
    { icon: 'pi pi-box', title: 'Inventory & Products' },
    { icon: 'pi pi-chart-bar', title: 'Reports & Analytics' },
    { icon: 'pi pi-shield', title: 'Security & Privacy' },
  ];
  readonly supportCategoryOptions: SupportOption[] = [
    { label: 'Orders', value: 'orders' },
    { label: 'Products', value: 'products' },
    { label: 'Payments', value: 'payments' },
    { label: 'Account', value: 'account' },
    { label: 'Security', value: 'security' },
  ];
  readonly priorityOptions: SupportOption[] = [
    { label: 'Low', value: 'low' },
    { label: 'Normal', value: 'normal' },
    { label: 'High', value: 'high' },
    { label: 'Urgent', value: 'urgent' },
  ];

  submitRequest(): void {
    // TODO: Connect to support request workflow.
  }
}
