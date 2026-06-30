import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  CategoriesService,
  Category,
  Discount,
  DiscountAppliesTo,
  DiscountFormModel,
  DiscountMutationPayload,
  DiscountsService,
  DiscountStatus,
  DiscountStatusFilter,
  DiscountType,
  Product,
  ProductsService,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableColumn, AdminTableComponent, AdminTableRow } from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type DiscountModalMode = 'add' | 'edit';

type DiscountTableRow = AdminTableRow & {
  codeName: {
    title: string;
    code: string;
  };
  typeValue: {
    icon: string;
    iconClass: string;
    value: string;
    helper: string;
  };
  appliesTo: {
    main: string;
    sub: string | null;
  };
  usage: {
    current: number;
    limit: number | null;
    percent: number;
    helper: string;
  };
  validity: {
    start: string;
    end: string;
  };
  status: {
    labelKey?: string;
    label?: string;
    className: string;
  };
  actions: null;
};

interface SelectOption<T extends string | null = string> {
  label: string;
  value: T;
}

const EMPTY_DISCOUNT_FORM: DiscountFormModel = {
  name: '',
  code: '',
  discountType: 'percentage',
  discountValue: null,
  minimumOrderAmount: 0,
  appliesTo: 'all',
  productId: null,
  categoryId: null,
  usageLimit: null,
  usageCount: 0,
  usagePerCustomer: 1,
  isActive: true,
  startDate: '',
  endDate: '',
};

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableComponent,
    CommonModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './discounts.component.html',
  styleUrl: './discounts.component.css',
})
export class DiscountsComponent implements OnInit {
  private readonly discountsService = inject(DiscountsService);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly discounts = signal<Discount[]>([]);
  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly selectedStatus = signal<DiscountStatusFilter>('all');
  readonly selectedAppliesTo = signal<'all' | DiscountAppliesTo>('all');
  readonly modalMode = signal<DiscountModalMode>('add');
  readonly selectedDiscount = signal<Discount | null>(null);
  readonly discountPendingDelete = signal<Discount | null>(null);
  readonly isDiscountModalOpen = signal(false);
  readonly isDeleteModalOpen = signal(false);
  readonly formError = signal<string | null>(null);
  readonly discountForm = signal<DiscountFormModel>({ ...EMPTY_DISCOUNT_FORM });

  readonly statusOptions: SelectOption<DiscountStatusFilter>[] = [
    { label: 'PROMOTIONS.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'PROMOTIONS.STATUS.ACTIVE', value: 'active' },
    { label: 'PROMOTIONS.STATUS.SCHEDULED', value: 'scheduled' },
    { label: 'PROMOTIONS.STATUS.EXPIRED', value: 'expired' },
    { label: 'PROMOTIONS.STATUS.PAUSED', value: 'paused' },
  ];

  readonly appliesToFilterOptions: SelectOption<'all' | DiscountAppliesTo>[] = [
    { label: 'PROMOTIONS.FILTERS.ALL_APPLIES_TO', value: 'all' },
    { label: 'PROMOTIONS.APPLIES.PRODUCT', value: 'product' },
    { label: 'PROMOTIONS.APPLIES.CATEGORY', value: 'category' },
  ];

  readonly discountTypeOptions: SelectOption<DiscountType>[] = [
    { label: 'PROMOTIONS.TYPE.PERCENTAGE', value: 'percentage' },
    { label: 'PROMOTIONS.TYPE.FIXED_AMOUNT', value: 'fixed_amount' },
    { label: 'PROMOTIONS.TYPE.FREE_SHIPPING', value: 'free_shipping' },
  ];

  readonly appliesToOptions: SelectOption<DiscountAppliesTo>[] = [
    { label: 'PROMOTIONS.APPLIES.ALL', value: 'all' },
    { label: 'PROMOTIONS.APPLIES.PRODUCT', value: 'product' },
    { label: 'PROMOTIONS.APPLIES.CATEGORY', value: 'category' },
  ];

  readonly productOptions = computed<SelectOption[]>(() =>
    this.products()
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((product) => ({ label: product.name, value: product.id }))
  );

  readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories()
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((category) => ({ label: category.name, value: category.id }))
  );

  readonly discountTableColumns: AdminTableColumn[] = [
    { key: 'codeName', label: 'PROMOTIONS.TABLE.CODE_NAME', type: 'codeName' },
    { key: 'typeValue', label: 'PROMOTIONS.TABLE.TYPE_VALUE', type: 'discountValue' },
    { key: 'appliesTo', label: 'PROMOTIONS.TABLE.APPLIES_TO', type: 'appliesTo' },
    { key: 'usage', label: 'PROMOTIONS.TABLE.USAGE', type: 'usageProgress' },
    { key: 'validity', label: 'PROMOTIONS.TABLE.VALIDITY', type: 'dateRange' },
    { key: 'status', label: 'PROMOTIONS.TABLE.STATUS', type: 'badge' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  readonly formStatusOptions: {
    labelKey: string;
    value: DiscountStatus;
  }[] = [
      { labelKey: 'PROMOTIONS.STATUS.ACTIVE', value: 'active' },
      { labelKey: 'PROMOTIONS.STATUS.PAUSED', value: 'paused' },
      { labelKey: 'PROMOTIONS.STATUS.SCHEDULED', value: 'scheduled' },
      { labelKey: 'PROMOTIONS.STATUS.EXPIRED', value: 'expired' },
    ];

  readonly stats = computed(() => this.discountsService.getStatsFromDiscounts(this.discounts()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Active Discounts',
        titleKey: 'PROMOTIONS.KPI.ACTIVE_DISCOUNTS',
        subtitle: this.translate.instant('PROMOTIONS.KPI.TOTAL_CODES', { count: stats.totalDiscounts }),
        subtitleColor: '#20a464',
        value: stats.activeDiscounts.toString(),
        icon: 'pi pi-bolt',
        iconColor: '#20a464',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Total Uses',
        titleKey: 'PROMOTIONS.KPI.TOTAL_USES',
        subtitleKey: 'PROMOTIONS.KPI.ALL_TIME',
        value: stats.totalUsage.toLocaleString('en-US'),
        icon: 'pi pi-users',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Scheduled',
        titleKey: 'PROMOTIONS.KPI.SCHEDULED',
        value: stats.scheduledDiscounts.toString(),
        icon: 'pi pi-calendar',
        iconColor: '#3b78d8',
        iconBg: '#eaf2ff',
        showChart: false,
      },
      {
        title: 'Avg. Usage',
        titleKey: 'PROMOTIONS.KPI.AVG_USAGE',
        subtitleKey: 'PROMOTIONS.KPI.PER_CODE',
        value: stats.averageUsage.toLocaleString('en-US'),
        icon: 'pi pi-chart-bar',
        iconColor: '#8d877e',
        iconBg: '#f0ebe4',
        showChart: false,
      },
    ];
  });

  readonly filteredDiscounts = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const status = this.selectedStatus();
    const appliesTo = this.selectedAppliesTo();

    return this.discounts().filter((discount) => {
      const searchable = [
        discount.name,
        discount.code,
        discount.discount_type,
        discount.applies_to,
        discount.products?.name ?? '',
        discount.categories?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesStatus = status === 'all' || this.discountStatus(discount) === status;
      const matchesAppliesTo = appliesTo === 'all' || discount.applies_to === appliesTo;

      return matchesSearch && matchesStatus && matchesAppliesTo;
    });
  });

  readonly tableRows = computed<DiscountTableRow[]>(() =>
    this.filteredDiscounts().map((discount) => this.toTableRow(discount))
  );

  readonly mostUsedDiscount = computed(() =>
    [...this.discounts()].sort((first, second) => second.usage_count - first.usage_count)[0] ?? null
  );

  readonly activeUntilDiscount = computed(() =>
    this.discounts()
      .filter((discount) => this.discountStatus(discount) === 'active' && discount.end_date)
      .sort((first, second) => this.dateTime(first.end_date) - this.dateTime(second.end_date))[0] ?? null
  );

  readonly comingSoonDiscount = computed(() =>
    this.discounts()
      .filter((discount) => this.discountStatus(discount) === 'scheduled')
      .sort((first, second) => this.dateTime(first.start_date) - this.dateTime(second.start_date))[0] ?? null
  );

  async ngOnInit(): Promise<void> {
    await this.loadDiscountsPage();
  }

  async loadDiscountsPage(): Promise<void> {
    this.loading.set(true);

    try {
      const [discounts, products, categories] = await Promise.all([
        this.discountsService.getDiscounts(),
        this.productsService.getProducts(),
        this.categoriesService.getCategories(),
      ]);

      this.discounts.set(discounts);
      this.products.set(products);
      this.categories.set(categories);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDiscountModal(): void {
    this.modalMode.set('add');
    this.selectedDiscount.set(null);
    this.discountForm.set({ ...EMPTY_DISCOUNT_FORM });
    this.formError.set(null);
    this.isDiscountModalOpen.set(true);
  }

  currentFormStatus(): DiscountStatus {
    const form = this.discountForm();

    if (!form.isActive) {
      return 'paused';
    }

    const now = new Date();
    const startDate = form.startDate ? new Date(`${form.startDate}T00:00:00`) : null;
    const endDate = form.endDate ? new Date(`${form.endDate}T23:59:59`) : null;

    if (startDate && startDate > now) {
      return 'scheduled';
    }

    if (endDate && endDate < now) {
      return 'expired';
    }

    return 'active';
  }

  selectFormStatus(status: DiscountStatus): void {
    const today = this.toDateInputValue(new Date().toISOString());
    const tomorrow = this.toDateInputValue(
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    );
    const yesterday = this.toDateInputValue(
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    );

    if (status === 'paused') {
      this.discountForm.update((form) => ({
        ...form,
        isActive: false,
      }));
      return;
    }

    if (status === 'scheduled') {
      this.discountForm.update((form) => ({
        ...form,
        isActive: true,
        startDate: form.startDate && new Date(form.startDate) > new Date() ? form.startDate : tomorrow,
        endDate: form.endDate,
      }));
      return;
    }

    if (status === 'expired') {
      this.discountForm.update((form) => ({
        ...form,
        isActive: true,
        endDate: yesterday,
      }));
      return;
    }

    this.discountForm.update((form) => ({
      ...form,
      isActive: true,
      startDate: form.startDate && new Date(form.startDate) > new Date() ? today : form.startDate,
      endDate: form.endDate && new Date(form.endDate) < new Date() ? '' : form.endDate,
    }));
  }

  openEditDiscountModal(value: Discount | AdminTableRow): void {
    const discount = this.resolveDiscountFromTableEvent(value);

    if (!discount) {
      this.toast.failed('Opening discount', 'Discount data is missing.');
      return;
    }

    this.modalMode.set('edit');
    this.selectedDiscount.set(discount);
    this.formError.set(null);
    this.discountForm.set({
      name: discount.name,
      code: discount.code,
      discountType: discount.discount_type,
      discountValue: discount.discount_type === 'free_shipping' ? null : discount.discount_value,
      minimumOrderAmount: discount.minimum_order_amount ?? 0,
      appliesTo: discount.applies_to,
      productId: discount.product_id,
      categoryId: discount.category_id,
      usageLimit: discount.usage_limit,
      usageCount: discount.usage_count,
      usagePerCustomer: discount.usage_per_customer ?? 1,
      isActive: discount.is_active,
      startDate: this.toDateInputValue(discount.start_date),
      endDate: this.toDateInputValue(discount.end_date),
    });
    this.isDiscountModalOpen.set(true);
  }

  closeDiscountModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.isDiscountModalOpen.set(false);
    this.selectedDiscount.set(null);
    this.formError.set(null);
  }

  generateDiscountCode(): void {
    const name = this.discountForm().name.trim();

    if (!name) {
      return;
    }

    const words = name
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const yearSuffix = name.match(/\b20\d{2}\b/)?.[0]?.slice(-2);
    const base = words
      .filter((word) => !/^20\d{2}$/.test(word))
      .slice(0, yearSuffix ? 1 : 2)
      .join('')
      .toUpperCase()
      .slice(0, 12);

    this.updateDiscountForm('code', `${base || 'DISCOUNT'}${yearSuffix ?? ''}`);
  }

  updateDiscountForm<K extends keyof DiscountFormModel>(key: K, value: DiscountFormModel[K]): void {
    this.discountForm.update((form) => {
      const nextForm = {
        ...form,
        [key]: value,
      };

      if (key === 'code') {
        nextForm.code = String(value ?? '').trim().toUpperCase();
      }

      if (key === 'discountType' && value === 'free_shipping') {
        nextForm.discountValue = null;
      }

      if (key === 'appliesTo') {
        nextForm.productId = value === 'product' ? nextForm.productId : null;
        nextForm.categoryId = value === 'category' ? nextForm.categoryId : null;
      }

      return nextForm;
    });
  }

  async saveDiscount(): Promise<void> {
    const form = this.discountForm();
    const validationError = this.validateDiscountForm(form);

    if (validationError) {
      this.formError.set(validationError);
      this.toast.warn(
        this.translate.instant('PROMOTIONS.TOAST.INVALID_TITLE'),
        this.translate.instant(validationError)
      );
      return;
    }

    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      const payload = this.toMutationPayload(form);

      if (this.modalMode() === 'edit') {
        const discount = this.selectedDiscount();

        if (!discount) {
          throw new Error(this.translate.instant('PROMOTIONS.TOAST.MISSING_PROMOTION'));
        }

        const updatedDiscount = await this.discountsService.updateDiscount(discount.id, payload);

        this.discounts.update((items) =>
          items.map((item) => (item.id === updatedDiscount.id ? updatedDiscount : item))
        );

        this.toast.updated('Discount');
      } else {
        const createdDiscount = await this.discountsService.createDiscount(payload);

        this.discounts.update((items) => [createdDiscount, ...items]);
        this.clearFilters();
        this.toast.created('Discount');
      }

      this.closeDiscountModal(true);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.SAVE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.SAVE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  openDeleteDiscountModal(value: Discount | AdminTableRow): void {
    const discount = this.resolveDiscountFromTableEvent(value);

    if (!discount) {
      this.toast.failed('Opening delete modal', 'Discount data is missing.');
      return;
    }

    this.discountPendingDelete.set(discount);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteDiscountModal(): void {
    if (this.saving()) {
      return;
    }

    this.isDeleteModalOpen.set(false);
    this.discountPendingDelete.set(null);
  }

  async confirmDeleteDiscount(): Promise<void> {
    const discount = this.discountPendingDelete();

    if (!discount) {
      return;
    }

    this.saving.set(true);

    try {
      await this.discountsService.deleteDiscount(discount.id);
      this.discounts.update((items) => items.filter((item) => item.id !== discount.id));
      this.closeDeleteDiscountModal();
      this.toast.deleted('Discount');
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.DELETE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.DELETE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  async toggleDiscountActive(value: Discount | AdminTableRow): Promise<void> {
    const discount = this.resolveDiscountFromTableEvent(value);

    if (!discount) {
      this.toast.failed('Opening discount', 'Discount data is missing.');
      return;
    }

    try {
      const updatedDiscount = await this.discountsService.updateDiscount(discount.id, {
        is_active: !discount.is_active,
      });
      this.discounts.update((items) =>
        items.map((item) => (item.id === updatedDiscount.id ? updatedDiscount : item))
      );
      this.toast.success(this.translate.instant('PROMOTIONS.TOAST.STATUS_UPDATED'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.STATUS_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.STATUS_FAILED_DETAIL'))
      );
    }
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedStatus.set('all');
    this.selectedAppliesTo.set('all');
  }

  discountStatus(discount: Discount): DiscountStatus {
    return this.discountsService.getDiscountStatus(discount);
  }

  modalTitle(): string {
    return this.modalMode() === 'edit' ? 'PROMOTIONS.MODAL.EDIT_TITLE' : 'PROMOTIONS.MODAL.CREATE_TITLE';
  }

  modalSubtitle(): string {
    return this.modalMode() === 'edit' ? 'PROMOTIONS.MODAL.EDIT_SUBTITLE' : 'PROMOTIONS.MODAL.CREATE_SUBTITLE';
  }

  currentFormStatusLabelKey(): string {
    const form = this.discountForm();

    if (!form.isActive) {
      return 'PROMOTIONS.STATUS.PAUSED';
    }

    const now = new Date();
    const startDate = form.startDate ? new Date(`${form.startDate}T00:00:00`) : null;
    const endDate = form.endDate ? new Date(`${form.endDate}T23:59:59`) : null;

    if (startDate && startDate > now) {
      return 'PROMOTIONS.STATUS.SCHEDULED';
    }

    if (endDate && endDate < now) {
      return 'PROMOTIONS.STATUS.EXPIRED';
    }

    return 'PROMOTIONS.STATUS.ACTIVE';
  }

  currentFormStatusClass(): string {
    switch (this.currentFormStatusLabelKey()) {
      case 'PROMOTIONS.STATUS.ACTIVE':
        return 'bg-[#e9f8ef] text-[#117047]';
      case 'PROMOTIONS.STATUS.SCHEDULED':
        return 'bg-[#eaf2ff] text-[#2f6fd0]';
      case 'PROMOTIONS.STATUS.PAUSED':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'PROMOTIONS.STATUS.EXPIRED':
      default:
        return 'bg-[#f0ebe4] text-[#675f55]';
    }
  }

  deleteDiscountMessage(): string {
    const discount = this.discountPendingDelete();
    return this.translate.instant('PROMOTIONS.DELETE_MESSAGE', {
      name: discount?.name ?? this.translate.instant('PROMOTIONS.PROMOTION'),
    });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  formatCurrency(value: number, maximumFractionDigits = 2): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits,
    }).format(value);
  }

  private toTableRow(discount: Discount): DiscountTableRow {
    return {
      id: discount.id,
      raw: discount,
      codeName: {
        title: discount.name,
        code: discount.code,
      },
      typeValue: {
        icon: this.discountTypeIcon(discount),
        iconClass: this.discountTypeIconClass(discount),
        value: this.discountTypeValue(discount),
        helper: this.minimumLabel(discount),
      },
      appliesTo: {
        main: this.appliesToMainLabel(discount),
        sub: this.appliesToSubLabel(discount),
      },
      usage: {
        current: discount.usage_count,
        limit: discount.usage_limit,
        percent: this.usagePercent(discount),
        helper: this.translate.instant('PROMOTIONS.PER_CUSTOMER', {
          count: discount.usage_per_customer || 1,
        }),
      },
      validity: {
        start: this.formatDate(discount.start_date),
        end: this.formatDate(discount.end_date),
      },
      status: this.discountStatusBadge(discount),
      actions: null,
    };
  }

  private resolveDiscountFromTableEvent(value: Discount | AdminTableRow): Discount | null {
    const row = value as AdminTableRow;

    if (row.raw) {
      return row.raw as Discount;
    }

    const discount = value as Discount;

    if (discount?.id && discount?.name) {
      return discount;
    }

    return null;
  }

  private toMutationPayload(form: DiscountFormModel): DiscountMutationPayload {
    const usageLimit = this.optionalNumber(form.usageLimit);
    const usagePerCustomer = this.optionalNumber(form.usagePerCustomer) ?? 1;

    return {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      discount_type: form.discountType,
      discount_value: form.discountType === 'free_shipping' ? null : Number(form.discountValue),
      minimum_order_amount: this.optionalNumber(form.minimumOrderAmount) ?? 0,
      applies_to: form.appliesTo,
      product_id: form.appliesTo === 'product' ? form.productId : null,
      category_id: form.appliesTo === 'category' ? form.categoryId : null,
      usage_limit: usageLimit,
      usage_count: Number(form.usageCount ?? 0),
      usage_per_customer: usagePerCustomer,
      is_active: form.isActive,
      start_date: this.toTimestamp(form.startDate),
      end_date: this.toTimestamp(form.endDate),
    };
  }

  private validateDiscountForm(form: DiscountFormModel): string | null {
    if (!form.name.trim()) {
      return 'PROMOTIONS.ERRORS.NAME_REQUIRED';
    }

    if (!form.code.trim()) {
      return 'PROMOTIONS.ERRORS.CODE_REQUIRED';
    }

    if (form.discountType === 'percentage') {
      const value = Number(form.discountValue);

      if (!value || value < 1 || value > 100) {
        return 'PROMOTIONS.ERRORS.PERCENTAGE_VALUE';
      }
    }

    if (form.discountType === 'fixed_amount') {
      const value = Number(form.discountValue);

      if (!value || value <= 0) {
        return 'PROMOTIONS.ERRORS.FIXED_VALUE';
      }
    }

    if (form.appliesTo === 'product' && !form.productId) {
      return 'PROMOTIONS.ERRORS.PRODUCT_REQUIRED';
    }

    if (form.appliesTo === 'category' && !form.categoryId) {
      return 'PROMOTIONS.ERRORS.CATEGORY_REQUIRED';
    }

    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      return 'PROMOTIONS.ERRORS.END_BEFORE_START';
    }

    return null;
  }

  discountTypeIcon(discount: Discount): string {
    if (discount.discount_type === 'percentage') {
      return 'pi pi-percentage';
    }

    if (discount.discount_type === 'free_shipping') {
      return 'pi pi-truck';
    }

    return 'pi pi-dollar';
  }

  discountTypeIconClass(discount: Discount): string {
    if (discount.discount_type === 'percentage') {
      return 'bg-[#eef4e8] text-[#5f6f43]';
    }

    if (discount.discount_type === 'free_shipping') {
      return 'bg-[#eaf2ff] text-[#3b78d8]';
    }

    return 'bg-[#f3eee7] text-[#675f55]';
  }

  discountTypeValue(discount: Discount): string {
    if (discount.discount_type === 'free_shipping') {
      return this.translate.instant('PROMOTIONS.TYPE.FREE_SHIPPING');
    }

    if (discount.discount_type === 'percentage') {
      return `${discount.discount_value ?? 0}%`;
    }

    return this.formatCurrency(discount.discount_value ?? 0, 0);
  }

  minimumLabel(discount: Discount): string {
    const minimum = Number(discount.minimum_order_amount ?? 0);

    if (minimum <= 0) {
      return '';
    }

    return this.translate.instant('PROMOTIONS.MINIMUM', {
      value: this.formatCurrency(minimum, 0),
    });
  }

  appliesToMainLabel(discount: Discount): string {
    if (discount.applies_to === 'product') {
      return this.translate.instant('PROMOTIONS.APPLIES.PRODUCT');
    }

    if (discount.applies_to === 'category') {
      return this.translate.instant('PROMOTIONS.APPLIES.CATEGORY');
    }

    return this.translate.instant('PROMOTIONS.APPLIES.ALL');
  }

  appliesToSubLabel(discount: Discount): string | null {
    if (discount.applies_to === 'product') {
      return discount.products?.name ?? '-';
    }

    if (discount.applies_to === 'category') {
      return discount.categories?.name ?? '-';
    }

    return null;
  }

  usagePercent(discount: Discount): number {
    if (!discount.usage_limit) {
      return 0;
    }

    return Math.min(100, Math.round((discount.usage_count / discount.usage_limit) * 100));
  }

  discountStatusBadge(discount: Discount): {
    labelKey: string;
    className: string;
  } {
    switch (this.discountStatus(discount)) {
      case 'active':
        return {
          labelKey: 'PROMOTIONS.STATUS.ACTIVE',
          className: 'bg-[#e9f8ef] text-[#117047]',
        };
      case 'scheduled':
        return {
          labelKey: 'PROMOTIONS.STATUS.SCHEDULED',
          className: 'bg-[#eaf2ff] text-[#2f6fd0]',
        };
      case 'paused':
        return {
          labelKey: 'PROMOTIONS.STATUS.PAUSED',
          className: 'bg-[#fff6e7] text-[#a66309]',
        };
      case 'expired':
      default:
        return {
          labelKey: 'PROMOTIONS.STATUS.EXPIRED',
          className: 'bg-[#f0ebe4] text-[#675f55]',
        };
    }
  }

  private booleanBadge(value: boolean): {
    labelKey: string;
    className: string;
  } {
    return value
      ? { labelKey: 'COMMON.ACTIVE', className: 'bg-[#e9f8ef] text-[#117047]' }
      : { labelKey: 'PROMOTIONS.STATUS.INACTIVE', className: 'bg-[#fff1f0] text-[#b42318]' };
  }

  private toTimestamp(value: string): string | null {
    return value ? new Date(`${value}T00:00:00`).toISOString() : null;
  }

  private optionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  private toDateInputValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return new Date(value).toISOString().slice(0, 10);
  }

  private dateTime(value: string | null | undefined): number {
    return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
