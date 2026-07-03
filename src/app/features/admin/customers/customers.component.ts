import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminCustomer, CustomerStatus, CustomerTier, CustomersService } from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableCellTemplateDirective, AdminTableColumn, AdminTableComponent, AdminTableRow } from '../../../shared/ui/admin-table';
import { ExportReportComponent, ExportReportConfig } from '../../../shared/ui/export-report';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

interface AdminSelectOption<T extends string = string> {
  label: string;
  value: T;
}

type StatusFilter = 'all' | CustomerStatus;
type TierFilter = 'all' | CustomerTier;

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableCellTemplateDirective,
    AdminTableComponent,
    CommonModule,
    ExportReportComponent,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.css'],
})
export class CustomersComponent implements OnInit {
  private readonly customersService = inject(CustomersService);
  private readonly toast = inject(ToastService);

  readonly customers = signal<AdminCustomer[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly selectedStatus = signal<StatusFilter>('all');
  readonly selectedTier = signal<TierFilter>('all');
  readonly selectedCustomer = signal<AdminCustomer | null>(null);

  readonly customerTableColumns: AdminTableColumn[] = [
    { key: 'customer', label: 'CUSTOMER', type: 'imageText' },
    { key: 'location', label: 'LOCATION', type: 'text' },
    { key: 'orders', label: 'ORDERS', type: 'number' },
    { key: 'totalSpent', label: 'TOTAL SPENT', type: 'price' },
    { key: 'tier', label: 'TIER', type: 'badge' },
    { key: 'status', label: 'STATUS', type: 'status' },
    { key: 'joined', label: 'JOINED', type: 'text' },
    { key: 'actions', label: 'ACTIONS', type: 'actions' },
  ];

  readonly statusOptions: AdminSelectOption<StatusFilter>[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
    { label: 'Blocked', value: 'Blocked' },
  ];

  readonly tierOptions: AdminSelectOption<TierFilter>[] = [
    { label: 'All', value: 'all' },
    { label: 'Bronze', value: 'Bronze' },
    { label: 'Silver', value: 'Silver' },
    { label: 'Gold', value: 'Gold' },
    { label: 'Platinum', value: 'Platinum' },
  ];

  readonly stats = computed(() => {
    const customers = this.customers();
    return {
      total: customers.length,
      active: customers.filter((customer) => customer.status === 'Active').length,
      platinum: customers.filter((customer) => customer.tier === 'Platinum').length,
      gold: customers.filter((customer) => customer.tier === 'Gold').length,
      silver: customers.filter((customer) => customer.tier === 'Silver').length,
      revenue: customers.reduce((sum, customer) => sum + (customer.totalSpent ?? 0), 0),
    };
  });

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();
    return [
      {
        title: 'Platinum Tier',
        value: stats.platinum.toString(),
        icon: 'pi pi-star',
        iconColor: '#3b78d8',
        iconBg: '#edf4ff',
        showChart: false,
      },
      {
        title: 'Gold Tier',
        value: stats.gold.toString(),
        icon: 'pi pi-star',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Silver Tier',
        value: stats.silver.toString(),
        icon: 'pi pi-star',
        iconColor: '#57534e',
        iconBg: '#f4f4f5',
        showChart: false,
      },
      {
        title: 'Total Revenue',
        value: this.formatCurrency(stats.revenue),
        icon: 'pi pi-wallet',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
    ];
  });

  readonly subtitle = computed(() => {
    const stats = this.stats();
    return `${stats.total} registered customers · ${stats.active} active`;
  });

  readonly customersExportConfig = computed<ExportReportConfig>(() => {
    const customers = this.filteredCustomers();

    return {
      fileName: 'nestora-customers-report',
      reportTitle: 'Nestora Home - Customers Report',
      reportSubtitle: `${customers.length} customers exported`,
      orientation: 'landscape',
      summaryItems: [
        { label: 'Total Customers', value: customers.length },
        { label: 'Active', value: customers.filter((customer) => customer.status === 'Active').length },
        { label: 'Platinum Tier', value: customers.filter((customer) => customer.tier === 'Platinum').length },
        { label: 'Total Revenue', value: this.formatCurrency(customers.reduce((sum, customer) => sum + (customer.totalSpent ?? 0), 0)) },
      ],
      sections: [
        {
          title: 'Customers',
          headers: [
            'Customer ID',
            'Full Name',
            'Email',
            'Phone',
            'Address',
            'City',
            'Country',
            'Status',
            'Tier',
            'Total Orders',
            'Total Spent',
            'Joined',
          ],
          excludedPdfColumns: [
            'Customer ID',
            'Address',
          ],
          truncateColumns: ['Full Name', 'Email', 'Address'],
          columnWidths: {
            'Customer ID': 32,
            'Full Name': 28,
            'Email': 32,
            'Phone': 22,
            'Address': 32,
            'City': 18,
            'Country': 18,
            'Status': 16,
            'Tier': 14,
            'Total Orders': 18,
            'Total Spent': 18,
            'Joined': 16,
          },
          rows: customers.map((customer) => [
            customer.id,
            customer.fullName,
            customer.email ?? '-',
            customer.phone ?? '-',
            customer.address ?? '-',
            customer.city ?? '-',
            customer.country ?? '-',
            customer.status,
            customer.tier,
            String(customer.totalOrders),
            this.formatCurrency(customer.totalSpent),
            this.formatJoined(customer.createdAt),
          ]),
        },
      ],
    };
  });

  readonly filteredCustomers = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedStatus = this.selectedStatus();
    const selectedTier = this.selectedTier();

    return this.customers().filter((customer) => {
      const matchesSearch =
        !searchTerm ||
        customer.fullName.toLowerCase().includes(searchTerm) ||
        (customer.email ?? '').toLowerCase().includes(searchTerm) ||
        (customer.phone ?? '').toLowerCase().includes(searchTerm) ||
        (customer.city ?? '').toLowerCase().includes(searchTerm) ||
        (customer.country ?? '').toLowerCase().includes(searchTerm);

      const matchesStatus = selectedStatus === 'all' || customer.status === selectedStatus;
      const matchesTier = selectedTier === 'all' || customer.tier === selectedTier;

      return matchesSearch && matchesStatus && matchesTier;
    });
  });

  readonly tableRows = computed<AdminTableRow[]>(() =>
    this.filteredCustomers().map((customer) => this.toTableRow(customer))
  );

  async ngOnInit(): Promise<void> {
    await this.loadCustomers();
  }

  async loadCustomers(): Promise<void> {
    this.loading.set(true);

    try {
      this.customers.set(await this.customersService.getCustomers());
    } catch (error) {
      this.toast.failed('Customers could not be loaded', this.errorDetail(error, 'Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  openCustomerDetails(customer: AdminCustomer | AdminTableRow): void {
    const selected = ('raw' in customer ? customer.raw : customer) as AdminCustomer | undefined;
    if (!selected) {
      return;
    }
    this.selectedCustomer.set(selected);
  }

  closeCustomerDetails(): void {
    this.selectedCustomer.set(null);
  }

  exportCsv(): void {
    const rows = this.filteredCustomers();
    const header = [
      'Customer ID',
      'Full Name',
      'Email',
      'Phone',
      'Status',
      'Tier',
      'Total Orders',
      'Total Spent',
      'City',
      'Country',
      'Joined',
    ];

    const csvRows = [
      header,
      ...rows.map((customer) => [
        customer.id,
        customer.fullName,
        customer.email ?? '',
        customer.phone ?? '',
        customer.status,
        customer.tier,
        String(customer.totalOrders),
        this.formatCurrency(customer.totalSpent),
        customer.city ?? '',
        customer.country ?? '',
        this.formatJoined(customer.createdAt),
      ]),
    ];

    const csv = csvRows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'customers.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  customerAvatarInitials(name: string): string {
    const words = name.trim().split(/\s+/);
    if (words.length === 0) {
      return 'CU';
    }
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  formatCurrency(amount: number): string {
    return `£${Number(amount ?? 0).toFixed(2)}`;
  }

  formatJoined(dateString: string): string {
    if (!dateString) {
      return 'N/A';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    });
  }

  customerLocation(customer: AdminCustomer): string {
    const city = customer.city?.trim();
    const country = customer.country?.trim();

    if (!city && !country) {
      return '—';
    }

    if (city && country) {
      return `${city}, ${country}`;
    }

    return city || country || '—';
  }

  customerStatusBadge(status: CustomerStatus) {
    switch (status) {
      case 'Active':
        return { label: status, className: 'bg-[#ecfdf5] text-[#166534]' };
      case 'Inactive':
        return { label: status, className: 'bg-[#f8fafc] text-[#475569]' };
      case 'Blocked':
      default:
        return { label: status, className: 'bg-[#fff1f0] text-[#b42318]' };
    }
  }

  customerTierBadge(tier: CustomerTier) {
    switch (tier) {
      case 'Platinum':
        return { label: tier, className: 'bg-[#eef4ff] text-[#3b78d8]' };
      case 'Gold':
        return { label: tier, className: 'bg-[#fff6e7] text-[#d98916]' };
      case 'Silver':
        return { label: tier, className: 'bg-[#f4f4f5] text-[#57534e]' };
      case 'Bronze':
      default:
        return { label: tier, className: 'bg-[#fef3c7] text-[#92400e]' };
    }
  }

  updateSearch(value: unknown): void {
    this.searchTerm.set(String(value ?? ''));
  }

  updateStatus(value: unknown): void {
    this.selectedStatus.set((value as StatusFilter) || 'all');
  }

  updateTier(value: unknown): void {
    this.selectedTier.set((value as TierFilter) || 'all');
  }

  private toTableRow(customer: AdminCustomer): AdminTableRow {
    const avatarText = customer.avatarUrl ? undefined : this.customerAvatarInitials(customer.fullName);

    return {
      id: customer.id,
      raw: customer,
      customer: {
        imageUrl: customer.avatarUrl ?? undefined,
        imageFallbackLabel: avatarText,
        title: customer.fullName,
        subtitle: customer.email ?? 'No email provided',
        initials: avatarText,
      },
      location: this.customerLocation(customer),
      orders: customer.totalOrders,
      totalSpent: this.formatCurrency(customer.totalSpent),
      tier: this.customerTierBadge(customer.tier),
      status: this.customerStatusBadge(customer.status),
      joined: this.formatJoined(customer.createdAt),
      actions: null,
    };
  }

  private csvCell(value: string): string {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
