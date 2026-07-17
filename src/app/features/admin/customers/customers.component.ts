import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminCustomer, CustomerStatus, CustomerTier, CustomersService } from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableCellTemplateDirective, AdminTableColumn, AdminTableComponent, AdminTableRow } from '../../../shared/ui/admin-table';
import { ExportReportComponent, ExportReportConfig } from '../../../shared/ui/export-report';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';
import { getInitialsAvatar } from '../../../shared/utils/initials-avatar.util';

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
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly customers = signal<AdminCustomer[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly selectedStatus = signal<StatusFilter>('all');
  readonly selectedTier = signal<TierFilter>('all');
  readonly selectedCustomer = signal<AdminCustomer | null>(null);
  readonly langVersion = signal(0);

  readonly customerTableColumns = computed<AdminTableColumn[]>(() => {
    this.langVersion();

    return [
      { key: 'customer', label: this.t('CUSTOMERS.TABLE.CUSTOMER'), type: 'imageText' },
      { key: 'location', label: this.t('CUSTOMERS.TABLE.LOCATION'), type: 'text' },
      { key: 'orders', label: this.t('CUSTOMERS.TABLE.ORDERS'), type: 'number' },
      { key: 'totalSpent', label: this.t('CUSTOMERS.TABLE.SPENT'), type: 'price' },
      { key: 'tier', label: this.t('CUSTOMERS.TABLE.TIER'), type: 'badge' },
      { key: 'status', label: this.t('CUSTOMERS.TABLE.STATUS'), type: 'status' },
      { key: 'joined', label: this.t('CUSTOMERS.TABLE.JOINED'), type: 'text' },
      { key: 'actions', label: this.t('CUSTOMERS.TABLE.ACTIONS'), type: 'actions' },
    ];
  });

  readonly statusOptions = computed<AdminSelectOption<StatusFilter>[]>(() => {
    this.langVersion();

    return [
      { label: this.t('CUSTOMERS.FILTERS.ALL_STATUSES'), value: 'all' },
      { label: this.customerStatusLabel('Active'), value: 'Active' },
      { label: this.customerStatusLabel('Inactive'), value: 'Inactive' },
      { label: this.customerStatusLabel('Blocked'), value: 'Blocked' },
    ];
  });

  readonly tierOptions = computed<AdminSelectOption<TierFilter>[]>(() => {
    this.langVersion();

    return [
      { label: this.t('CUSTOMERS.FILTERS.ALL_TIERS'), value: 'all' },
      { label: this.customerTierLabel('Bronze'), value: 'Bronze' },
      { label: this.customerTierLabel('Silver'), value: 'Silver' },
      { label: this.customerTierLabel('Gold'), value: 'Gold' },
      { label: this.customerTierLabel('Platinum'), value: 'Platinum' },
    ];
  });

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
    this.langVersion();
    const stats = this.stats();
    return [
      {
        title: this.t('CUSTOMERS.KPI.TOTAL_CUSTOMERS'),
        value: stats.total.toString(),
        icon: 'pi pi-users',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: this.t('CUSTOMERS.KPI.ACTIVE_CUSTOMERS'),
        value: stats.active.toString(),
        icon: 'pi pi-check-circle',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: this.t('CUSTOMERS.KPI.VIP_CUSTOMERS'),
        value: stats.platinum.toString(),
        icon: 'pi pi-star',
        iconColor: '#3b78d8',
        iconBg: '#edf4ff',
        showChart: false,
      },
      {
        title: this.t('CUSTOMERS.KPI.TOTAL_SPENT'),
        value: this.formatCurrency(stats.revenue),
        icon: 'pi pi-wallet',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
    ];
  });

  readonly subtitle = computed(() => {
    this.langVersion();
    return this.t('CUSTOMERS.SUBTITLE', { count: this.stats().total });
  });

  readonly customersExportConfig = computed<ExportReportConfig>(() => {
    this.langVersion();
    const customers = this.filteredCustomers();

    return {
      fileName: 'nestora-customers-report',
      reportTitle: this.t('CUSTOMERS.EXPORT_REPORT_TITLE'),
      reportSubtitle: this.t('CUSTOMERS.EXPORT_SUBTITLE', { count: customers.length }),
      orientation: 'landscape',
      summaryItems: [
        { label: this.t('CUSTOMERS.KPI.TOTAL_CUSTOMERS'), value: customers.length },
        { label: this.t('CUSTOMERS.KPI.ACTIVE_CUSTOMERS'), value: customers.filter((customer) => customer.status === 'Active').length },
        { label: this.t('CUSTOMERS.KPI.VIP_CUSTOMERS'), value: customers.filter((customer) => customer.tier === 'Platinum').length },
        { label: this.t('CUSTOMERS.KPI.TOTAL_SPENT'), value: this.formatCurrency(customers.reduce((sum, customer) => sum + (customer.totalSpent ?? 0), 0)) },
      ],
      sections: [
        {
          title: this.t('CUSTOMERS.TITLE'),
          headers: [
            this.t('CUSTOMERS.TABLE.CUSTOMER_ID'),
            this.t('CUSTOMERS.TABLE.FULL_NAME'),
            this.t('CUSTOMERS.TABLE.EMAIL'),
            this.t('CUSTOMERS.TABLE.PHONE'),
            this.t('CUSTOMERS.FIELDS.ADDRESS'),
            this.t('CUSTOMERS.TABLE.CITY'),
            this.t('CUSTOMERS.TABLE.COUNTRY'),
            this.t('CUSTOMERS.TABLE.STATUS'),
            this.t('CUSTOMERS.TABLE.TIER'),
            this.t('CUSTOMERS.FIELDS.TOTAL_ORDERS'),
            this.t('CUSTOMERS.FIELDS.TOTAL_SPENT'),
            this.t('CUSTOMERS.TABLE.JOINED'),
          ],
          excludedPdfColumns: [
            this.t('CUSTOMERS.TABLE.CUSTOMER_ID'),
            this.t('CUSTOMERS.FIELDS.ADDRESS'),
          ],
          truncateColumns: [this.t('CUSTOMERS.TABLE.FULL_NAME'), this.t('CUSTOMERS.TABLE.EMAIL'), this.t('CUSTOMERS.FIELDS.ADDRESS')],
          columnWidths: {
            [this.t('CUSTOMERS.TABLE.CUSTOMER_ID')]: 32,
            [this.t('CUSTOMERS.TABLE.FULL_NAME')]: 28,
            [this.t('CUSTOMERS.TABLE.EMAIL')]: 32,
            [this.t('CUSTOMERS.TABLE.PHONE')]: 22,
            [this.t('CUSTOMERS.FIELDS.ADDRESS')]: 32,
            [this.t('CUSTOMERS.TABLE.CITY')]: 18,
            [this.t('CUSTOMERS.TABLE.COUNTRY')]: 18,
            [this.t('CUSTOMERS.TABLE.STATUS')]: 16,
            [this.t('CUSTOMERS.TABLE.TIER')]: 14,
            [this.t('CUSTOMERS.FIELDS.TOTAL_ORDERS')]: 18,
            [this.t('CUSTOMERS.FIELDS.TOTAL_SPENT')]: 18,
            [this.t('CUSTOMERS.TABLE.JOINED')]: 16,
          },
          rows: customers.map((customer) => [
            customer.id,
            customer.fullName,
            customer.email ?? '-',
            customer.phone ?? '-',
            customer.address ?? '-',
            customer.city ?? '-',
            customer.country ?? '-',
            this.customerStatusLabel(customer.status),
            this.customerTierLabel(customer.tier),
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

  readonly tableRows = computed<AdminTableRow[]>(() => {
    this.langVersion();
    return this.filteredCustomers().map((customer) => this.toTableRow(customer));
  });

  constructor() {
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.langVersion.update((version) => version + 1));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.searchTerm.set(params.get('q') ?? ''));
  }

  async ngOnInit(): Promise<void> {
    await this.loadCustomers();
  }

  async loadCustomers(): Promise<void> {
    this.loading.set(true);

    try {
      this.customers.set(await this.customersService.getCustomers());
    } catch (error) {
      this.toast.failed(
        this.t('CUSTOMERS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.t('CUSTOMERS.TOAST.LOAD_FAILED_DETAIL'))
      );
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
      this.t('CUSTOMERS.TABLE.CUSTOMER_ID'),
      this.t('CUSTOMERS.TABLE.FULL_NAME'),
      this.t('CUSTOMERS.TABLE.EMAIL'),
      this.t('CUSTOMERS.TABLE.PHONE'),
      this.t('CUSTOMERS.TABLE.STATUS'),
      this.t('CUSTOMERS.TABLE.TIER'),
      this.t('CUSTOMERS.FIELDS.TOTAL_ORDERS'),
      this.t('CUSTOMERS.FIELDS.TOTAL_SPENT'),
      this.t('CUSTOMERS.TABLE.CITY'),
      this.t('CUSTOMERS.TABLE.COUNTRY'),
      this.t('CUSTOMERS.TABLE.JOINED'),
    ];

    const csvRows = [
      header,
      ...rows.map((customer) => [
        customer.id,
        customer.fullName,
        customer.email ?? '',
        customer.phone ?? '',
        this.customerStatusLabel(customer.status),
        this.customerTierLabel(customer.tier),
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

  formatCurrency(amount: number): string {
    return `$${Number(amount ?? 0).toFixed(2)}`;
  }

  formatJoined(dateString: string): string {
    if (!dateString) {
      return this.t('CUSTOMERS.NA');
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return this.t('CUSTOMERS.NA');
    }

    const locale = this.translate.currentLang() === 'ar' ? 'ar' : 'en-GB';
    return date.toLocaleDateString(locale, {
      month: 'short',
      year: 'numeric',
    });
  }

  customerLocation(customer: AdminCustomer): string {
    const city = customer.city?.trim();
    const country = customer.country?.trim();

    if (!city && !country) {
      return this.t('CUSTOMERS.NA');
    }

    if (city && country) {
      return `${city}, ${country}`;
    }

    return city || country || this.t('CUSTOMERS.NA');
  }

  customerStatusBadge(status: CustomerStatus) {
    switch (status) {
      case 'Active':
        return { label: this.customerStatusLabel(status), className: 'bg-[#ecfdf5] text-[#166534]' };
      case 'Inactive':
        return { label: this.customerStatusLabel(status), className: 'bg-[#f8fafc] text-[#475569]' };
      case 'Blocked':
      default:
        return { label: this.customerStatusLabel(status), className: 'bg-[#fff1f0] text-[#b42318]' };
    }
  }

  customerTierBadge(tier: CustomerTier) {
    switch (tier) {
      case 'Platinum':
        return { label: this.customerTierLabel(tier), className: 'bg-[#eef4ff] text-[#3b78d8]' };
      case 'Gold':
        return { label: this.customerTierLabel(tier), className: 'bg-[#fff6e7] text-[#d98916]' };
      case 'Silver':
        return { label: this.customerTierLabel(tier), className: 'bg-[#f4f4f5] text-[#57534e]' };
      case 'Bronze':
      default:
        return { label: this.customerTierLabel(tier), className: 'bg-[#fef3c7] text-[#92400e]' };
    }
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }

  customerStatusLabel(status: CustomerStatus): string {
    return this.t(`CUSTOMERS.STATUS.${this.translationKey(status)}`);
  }

  customerTierLabel(tier: CustomerTier): string {
    return this.t(`CUSTOMERS.TIER.${this.translationKey(tier)}`);
  }

  translationKey(value: string): string {
    return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
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
    const avatar = getInitialsAvatar(customer.fullName, customer.email ?? customer.id);

    return {
      id: customer.id,
      raw: customer,
      customer: {
        imageUrl: customer.avatarUrl ?? undefined,
        title: customer.fullName,
        subtitle: customer.email ?? this.t('CUSTOMERS.NO_EMAIL'),
        initials: avatar.initials,
        avatarBackground: avatar.backgroundColor,
        avatarTextColor: avatar.textColor,
        avatarShape: 'circle',
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
