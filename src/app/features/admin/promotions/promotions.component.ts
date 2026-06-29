import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  Promotion,
  PromotionMutationPayload,
  PromotionsService,
  PromotionStatus,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableColumn, AdminTableRow, AdminTableComponent } from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type PromotionModalMode = 'add' | 'edit';
type PromotionStatusFilter = 'all' | PromotionStatus;

type PromotionTableRow = AdminTableRow & {
  codeName: {
    title: string;
    subtitle: string;
    initials: string;
  };
  typeValue: string;
  appliesTo: {
    label: string;
    className: string;
  };
  usage: string;
  validity: string;
  status: PromotionStatus;
  active: {
    label: string;
    className: string;
  };
  actions: null;
};

interface SelectOption<T extends string = string> {
  label: string;
  value: T;
}

interface PromotionFormModel {
  title: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  buttonLink: string;
  placement: string;
  backgroundColor: string;
  textColor: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

const EMPTY_PROMOTION_FORM: PromotionFormModel = {
  title: '',
  description: '',
  imageUrl: '',
  buttonText: '',
  buttonLink: '',
  placement: '',
  backgroundColor: '#f7f4ef',
  textColor: '#1f2a1f',
  isActive: true,
  startDate: '',
  endDate: '',
};

@Component({
  selector: 'app-promotions',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableComponent,
    CommonModule,
    FormsModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './promotions.component.html',
  styleUrl: './promotions.component.css',
})
export class PromotionsComponent implements OnInit {
  private readonly promotionsService = inject(PromotionsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly promotions = signal<Promotion[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly selectedStatus = signal<PromotionStatusFilter>('all');
  readonly selectedPlacement = signal('all');
  readonly modalMode = signal<PromotionModalMode>('add');
  readonly selectedPromotion = signal<Promotion | null>(null);
  readonly promotionPendingDelete = signal<Promotion | null>(null);
  readonly isPromotionModalOpen = signal(false);
  readonly isDeleteModalOpen = signal(false);
  readonly formError = signal<string | null>(null);
  readonly promotionForm = signal<PromotionFormModel>({ ...EMPTY_PROMOTION_FORM });

  readonly statusOptions: SelectOption<PromotionStatusFilter>[] = [
    { label: 'PROMOTIONS.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'PROMOTIONS.STATUS.ACTIVE', value: 'active' },
    { label: 'PROMOTIONS.STATUS.SCHEDULED', value: 'scheduled' },
    { label: 'PROMOTIONS.STATUS.EXPIRED', value: 'expired' },
    { label: 'PROMOTIONS.STATUS.PAUSED', value: 'paused' },
  ];

  readonly promotionTableColumns: AdminTableColumn[] = [
    { key: 'codeName', label: 'PROMOTIONS.TABLE.CODE_NAME', type: 'imageText' },
    { key: 'typeValue', label: 'PROMOTIONS.TABLE.TYPE_VALUE', type: 'text' },
    { key: 'appliesTo', label: 'PROMOTIONS.TABLE.APPLIES_TO', type: 'badge' },
    { key: 'usage', label: 'PROMOTIONS.TABLE.USAGE', type: 'text' },
    { key: 'validity', label: 'PROMOTIONS.TABLE.VALIDITY', type: 'text' },
    { key: 'active', label: 'PROMOTIONS.FIELDS.IS_ACTIVE', type: 'badge' },
    { key: 'status', label: 'PROMOTIONS.TABLE.STATUS', type: 'status' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  // readonly visiblePromotions = computed(() => {
  //   const start = (this.currentPage() - 1) * this.pageSize();
  //   return this.filteredPromotions().slice(start, start + this.pageSize());
  // });

  readonly tableRows = computed<PromotionTableRow[]>(() =>
    this.filteredPromotions().map((promotion) => this.toTableRow(promotion))
  );

  readonly placementOptions = computed<SelectOption[]>(() => {
    const placements = Array.from(
      new Set(this.promotions().map((promotion) => promotion.placement?.trim()).filter(Boolean) as string[])
    ).sort((first, second) => first.localeCompare(second));

    return [
      { label: 'PROMOTIONS.FILTERS.ALL_PLACEMENTS', value: 'all' },
      ...placements.map((placement) => ({ label: placement, value: placement })),
    ];
  });

  readonly stats = computed(() => this.promotionsService.getStatsFromPromotions(this.promotions()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();
    const totalUsage = this.totalUsage();
    const averageUsage = stats.totalPromotions ? Math.round(totalUsage / stats.totalPromotions) : 0;

    return [
      {
        title: 'Active Discounts',
        titleKey: 'PROMOTIONS.KPI.ACTIVE_DISCOUNTS',
        subtitle: this.translate.instant('PROMOTIONS.KPI.TOTAL_CODES', { count: stats.totalPromotions }),
        subtitleColor: '#20a464',
        value: stats.activePromotions.toString(),
        icon: 'pi pi-bolt',
        iconColor: '#20a464',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Total Uses',
        titleKey: 'PROMOTIONS.KPI.TOTAL_USES',
        subtitleKey: 'PROMOTIONS.KPI.ALL_TIME',
        value: totalUsage.toLocaleString('en-US'),
        icon: 'pi pi-users',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Scheduled',
        titleKey: 'PROMOTIONS.KPI.SCHEDULED',
        value: stats.scheduledPromotions.toString(),
        icon: 'pi pi-calendar',
        iconColor: '#3b78d8',
        iconBg: '#eaf2ff',
        showChart: false,
      },
      {
        title: 'Avg. Usage',
        titleKey: 'PROMOTIONS.KPI.AVG_USAGE',
        subtitleKey: 'PROMOTIONS.KPI.PER_CODE',
        value: averageUsage.toLocaleString('en-US'),
        icon: 'pi pi-chart-bar',
        iconColor: '#8d877e',
        iconBg: '#f0ebe4',
        showChart: false,
      },
    ];
  });

  readonly filteredPromotions = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const status = this.selectedStatus();
    const placement = this.selectedPlacement();

    return this.promotions().filter((promotion) => {
      const matchesSearch =
        !searchTerm ||
        promotion.title.toLowerCase().includes(searchTerm) ||
        (promotion.description ?? '').toLowerCase().includes(searchTerm) ||
        (promotion.button_text ?? '').toLowerCase().includes(searchTerm) ||
        (promotion.placement ?? '').toLowerCase().includes(searchTerm);
      const matchesStatus = status === 'all' || this.promotionStatus(promotion) === status;
      const matchesPlacement = placement === 'all' || promotion.placement === placement;

      return matchesSearch && matchesStatus && matchesPlacement;
    });
  });

  // readonly visiblePromotions = computed(() => {
  //   const start = (this.currentPage() - 1) * this.pageSize();
  //   return this.filteredPromotions().slice(start, start + this.pageSize());
  // });

  readonly mostUsedPromotion = computed(() =>
    [...this.promotions()].sort((first, second) => this.usageFor(second) - this.usageFor(first))[0] ?? null
  );

  readonly activeUntilPromotion = computed(() =>
    this.promotions()
      .filter((promotion) => this.promotionStatus(promotion) === 'active' && promotion.end_date)
      .sort((first, second) => this.dateTime(first.end_date) - this.dateTime(second.end_date))[0] ?? null
  );

  readonly comingSoonPromotion = computed(() =>
    this.promotions()
      .filter((promotion) => this.promotionStatus(promotion) === 'scheduled')
      .sort((first, second) => this.dateTime(first.start_date) - this.dateTime(second.start_date))[0] ?? null
  );

  async ngOnInit(): Promise<void> {
    await this.loadPromotions();
  }

  async loadPromotions(): Promise<void> {
    this.loading.set(true);

    try {
      this.promotions.set(await this.promotionsService.getPromotions());
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openCreatePromotionModal(): void {
    this.modalMode.set('add');
    this.selectedPromotion.set(null);
    this.promotionForm.set({ ...EMPTY_PROMOTION_FORM });
    this.formError.set(null);
    this.isPromotionModalOpen.set(true);
  }

  // openEditPromotionModal(promotion: Promotion): void {
  //   this.modalMode.set('edit');
  //   this.selectedPromotion.set(promotion);
  //   this.formError.set(null);
  //   this.promotionForm.set({
  //     title: promotion.title,
  //     description: promotion.description ?? '',
  //     imageUrl: promotion.image_url ?? '',
  //     buttonText: promotion.button_text ?? '',
  //     buttonLink: promotion.button_link ?? '',
  //     placement: promotion.placement ?? '',
  //     backgroundColor: promotion.background_color ?? '#f7f4ef',
  //     textColor: promotion.text_color ?? '#1f2a1f',
  //     isActive: promotion.is_active !== false,
  //     startDate: this.toDateInputValue(promotion.start_date),
  //     endDate: this.toDateInputValue(promotion.end_date),
  //   });
  //   this.isPromotionModalOpen.set(true);
  // }

  openEditPromotionModal(value: Promotion | AdminTableRow): void {
    const promotion = this.resolvePromotionFromTableEvent(value);

    if (!promotion) {
      this.toast.failed('Opening promotion', 'Promotion data is missing.');
      return;
    }

    this.modalMode.set('edit');
    this.selectedPromotion.set(promotion);
    this.formError.set(null);
    this.promotionForm.set({
      title: promotion.title,
      description: promotion.description ?? '',
      imageUrl: promotion.image_url ?? '',
      buttonText: promotion.button_text ?? '',
      buttonLink: promotion.button_link ?? '',
      placement: promotion.placement ?? '',
      backgroundColor: promotion.background_color ?? '#f7f4ef',
      textColor: promotion.text_color ?? '#1f2a1f',
      isActive: promotion.is_active !== false,
      startDate: this.toDateInputValue(promotion.start_date),
      endDate: this.toDateInputValue(promotion.end_date),
    });
    this.isPromotionModalOpen.set(true);
  }

  openDeletePromotionModal(value: Promotion | AdminTableRow): void {
    const promotion = this.resolvePromotionFromTableEvent(value);

    if (!promotion) {
      this.toast.failed('Opening delete modal', 'Promotion data is missing.');
      return;
    }

    this.promotionPendingDelete.set(promotion);
    this.isDeleteModalOpen.set(true);
  }

  viewPromotion(row: AdminTableRow): void {
    const promotion = this.resolvePromotionFromTableEvent(row);

    if (!promotion) {
      this.toast.failed('Opening promotion', 'Promotion data is missing.');
      return;
    }

    this.togglePromotionActive(promotion);
  }

  private resolvePromotionFromTableEvent(value: Promotion | AdminTableRow): Promotion | null {
    const row = value as AdminTableRow;

    if (row.raw) {
      return row.raw as Promotion;
    }

    const promotion = value as Promotion;

    if (promotion?.id && promotion?.title) {
      return promotion;
    }

    return null;
  }

  private toTableRow(promotion: Promotion): PromotionTableRow {
    const status = this.promotionStatus(promotion);
    const usage = `${this.usageFor(promotion)}/${this.usageLimitFor(promotion)} · ${this.usagePercent(promotion)}%`;

    return {
      id: promotion.id,
      raw: promotion,
      codeName: {
        title: promotion.title,
        subtitle: this.codeFor(promotion),
        initials: this.promotionInitials(promotion),
      },
      typeValue: `${this.typeLabel(promotion)} · ${this.minimumLabel(promotion)}`,
      appliesTo: {
        label: promotion.placement || this.translate.instant('PROMOTIONS.ALL_PRODUCTS'),
        className: 'bg-[#f0ebe4] text-[#675f55]',
      },
      usage,
      validity: `${this.formatDate(promotion.start_date)} → ${this.formatDate(promotion.end_date)}`,
      active: this.booleanBadge(promotion.is_active ?? false, 'Active', 'Inactive'),
      status,
      actions: null,
    };
  }

  private promotionInitials(promotion: Promotion): string {
    return promotion.title
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  private booleanBadge(
    value: boolean | null,
    yesLabel = 'Yes',
    noLabel = 'No'
  ): {
    label: string;
    className: string;
  } {
    if (value) {
      return {
        label: yesLabel,
        className: 'bg-[#e9f8ef] text-[#117047]',
      };
    }

    return {
      label: noLabel,
      className: 'bg-[#fff1f0] text-[#b42318]',
    };
  }

  closePromotionModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.isPromotionModalOpen.set(false);
    this.selectedPromotion.set(null);
    this.formError.set(null);
  }

  updatePromotionForm<K extends keyof PromotionFormModel>(key: K, value: PromotionFormModel[K]): void {
    this.promotionForm.update((form) => ({
      ...form,
      [key]: value,
    }));
  }

  async savePromotion(): Promise<void> {
  const form = this.promotionForm();
  const validationError = this.validatePromotionForm(form);

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
      const promotion = this.selectedPromotion();

      if (!promotion) {
        throw new Error(this.translate.instant('PROMOTIONS.TOAST.MISSING_PROMOTION'));
      }

      const updatedPromotion = await this.promotionsService.updatePromotion(promotion.id, payload);

      this.promotions.update((items) =>
        items.map((item) => (item.id === updatedPromotion.id ? updatedPromotion : item))
      );

      this.toast.updated('Promotion');
    } else {
      const createdPromotion = await this.promotionsService.createPromotion(payload);

      this.promotions.update((items) => [createdPromotion, ...items]);

      this.toast.created('Promotion');
    }

    this.clearFilters();
    this.closePromotionModal(true);
  } catch (error) {
    this.toast.failed(
      this.translate.instant('PROMOTIONS.TOAST.SAVE_FAILED_TITLE'),
      this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.SAVE_FAILED_DETAIL'))
    );
  } finally {
    this.saving.set(false);
  }
}

  clearFilters(): void {
  this.searchTerm.set('');
  this.selectedStatus.set('all');
  this.selectedPlacement.set('all');
}

  // openDeletePromotionModal(promotion: Promotion): void {
  //   this.promotionPendingDelete.set(promotion);
  //   this.isDeleteModalOpen.set(true);
  // }

  closeDeletePromotionModal(): void {
    if (this.saving()) {
      return;
    }

    this.isDeleteModalOpen.set(false);
    this.promotionPendingDelete.set(null);
  }

  async confirmDeletePromotion(): Promise<void> {
    const promotion = this.promotionPendingDelete();

    if (!promotion) {
      return;
    }

    this.saving.set(true);

    try {
      await this.promotionsService.deletePromotion(promotion.id);
      await this.loadPromotions();
      this.closeDeletePromotionModal();
      this.toast.deleted('Promotion');
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.DELETE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.DELETE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  async togglePromotionActive(promotion: Promotion): Promise<void> {
    try {
      await this.promotionsService.updatePromotion(promotion.id, {
        is_active: promotion.is_active === false,
      });
      await this.loadPromotions();
      this.toast.success(this.translate.instant('PROMOTIONS.TOAST.STATUS_UPDATED'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS.TOAST.STATUS_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS.TOAST.STATUS_FAILED_DETAIL'))
      );
    }
  }

  promotionStatus(promotion: Promotion): PromotionStatus {
    return this.promotionsService.getPromotionStatus(promotion);
  }

  statusLabelKey(promotion: Promotion): string {
    return `PROMOTIONS.STATUS.${this.promotionStatus(promotion).toUpperCase()}`;
  }

  statusBadgeClass(promotion: Promotion): string {
    switch (this.promotionStatus(promotion)) {
      case 'active':
        return 'bg-[#e9f8ef] text-[#117047]';
      case 'scheduled':
        return 'bg-[#eaf2ff] text-[#2f6fd0]';
      case 'paused':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'expired':
      default:
        return 'bg-[#f0ebe4] text-[#675f55]';
    }
  }

  codeFor(promotion: Promotion): string {
    return (promotion.button_text || promotion.placement || promotion.title)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 14) || 'PROMO';
  }

  typeLabel(promotion: Promotion): string {
    const seed = this.hashPromotion(promotion);

    if (promotion.button_link?.toLowerCase().includes('free') || seed % 5 === 0) {
      return this.translate.instant('PROMOTIONS.TYPE.FREE_SHIP');
    }

    return seed % 2 === 0 ? `${10 + (seed % 5) * 5}%` : this.formatCurrency(10 + (seed % 6) * 5, 0);
  }

  typeIcon(promotion: Promotion): string {
    const value = this.typeLabel(promotion);

    if (value.includes('%')) {
      return 'pi pi-percentage';
    }

    if (value === this.translate.instant('PROMOTIONS.TYPE.FREE_SHIP')) {
      return 'pi pi-truck';
    }

    return 'pi pi-dollar';
  }

  typeIconClass(promotion: Promotion): string {
    const value = this.typeLabel(promotion);

    if (value === this.translate.instant('PROMOTIONS.TYPE.FREE_SHIP')) {
      return 'bg-[#eaf2ff] text-[#3b78d8]';
    }

    return value.includes('%') ? 'bg-[#eef4e8] text-[#5f6f43]' : 'bg-[#f3eee7] text-[#675f55]';
  }

  minimumLabel(promotion: Promotion): string {
    const minimum = 30 + (this.hashPromotion(promotion) % 8) * 10;
    return this.translate.instant('PROMOTIONS.MINIMUM', { value: this.formatCurrency(minimum, 0) });
  }

  appliesToLabel(promotion: Promotion): string {
    if (!promotion.placement) {
      return this.translate.instant('PROMOTIONS.ALL_PRODUCTS');
    }

    return promotion.placement.toLowerCase().includes('product')
      ? this.translate.instant('PROMOTIONS.APPLIES.PRODUCT')
      : this.translate.instant('PROMOTIONS.APPLIES.CATEGORY');
  }

  usageFor(promotion: Promotion): number {
    const limit = this.usageLimitFor(promotion);
    return Math.min(limit, 20 + (this.hashPromotion(promotion) % Math.max(40, limit - 20)));
  }

  usageLimitFor(promotion: Promotion): number {
    return [50, 100, 150, 200, 300, 500, 1000][this.hashPromotion(promotion) % 7];
  }

  usagePercent(promotion: Promotion): number {
    return Math.round((this.usageFor(promotion) / this.usageLimitFor(promotion)) * 100);
  }

  usagePerCustomer(promotion: Promotion): string {
    const count = 1 + (this.hashPromotion(promotion) % 2);
    return this.translate.instant('PROMOTIONS.PER_CUSTOMER', { count });
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

  modalTitle(): string {
    return this.modalMode() === 'edit' ? 'PROMOTIONS.MODAL.EDIT_TITLE' : 'PROMOTIONS.MODAL.CREATE_TITLE';
  }

  modalSubtitle(): string {
    return this.modalMode() === 'edit' ? 'PROMOTIONS.MODAL.EDIT_SUBTITLE' : 'PROMOTIONS.MODAL.CREATE_SUBTITLE';
  }

  deletePromotionMessage(): string {
    const promotion = this.promotionPendingDelete();
    return this.translate.instant('PROMOTIONS.DELETE_MESSAGE', {
      name: promotion?.title ?? this.translate.instant('PROMOTIONS.PROMOTION'),
    });
  }

  private totalUsage(): number {
    return this.promotions().reduce((total, promotion) => total + this.usageFor(promotion), 0);
  }

  private toMutationPayload(form: PromotionFormModel): PromotionMutationPayload {
    return {
      title: form.title,
      description: form.description || null,
      image_url: form.imageUrl || null,
      button_text: form.buttonText || null,
      button_link: form.buttonLink || null,
      placement: form.placement || null,
      background_color: form.backgroundColor || null,
      text_color: form.textColor || null,
      is_active: form.isActive,
      start_date: this.toTimestamp(form.startDate),
      end_date: this.toTimestamp(form.endDate),
    };
  }

  private validatePromotionForm(form: PromotionFormModel): string | null {
    if (!form.title.trim()) {
      return 'PROMOTIONS.ERRORS.TITLE_REQUIRED';
    }

    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      return 'PROMOTIONS.ERRORS.END_BEFORE_START';
    }

    return null;
  }

  private toTimestamp(value: string): string | null {
    return value ? new Date(`${value}T00:00:00`).toISOString() : null;
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

  private hashPromotion(promotion: Promotion): number {
    return [...`${promotion.id}${promotion.title}`].reduce((hash, character) => hash + character.charCodeAt(0), 0);
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
