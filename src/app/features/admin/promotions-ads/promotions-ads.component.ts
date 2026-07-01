import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  Promotion,
  PromotionDisplayType,
  PromotionMutationPayload,
  PromotionsService,
  PromotionStatus,
  PromotionType,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent, AdminFormFieldValue } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableColumn, AdminTableComponent, AdminTableRow } from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type PromotionModalMode = 'add' | 'edit';
type PromotionStatusFilter = 'all' | PromotionStatus;
type PromotionTypeFilter = 'all' | PromotionType;

interface SelectOption<T extends string | null = string> {
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
  displayType: PromotionDisplayType;
  icon: string | null;
  backgroundColor: string;
  textColor: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

type PromotionTableRow = AdminTableRow & {
  promotion: {
    imageUrl?: string | null;
    imageFallbackLabel?: string;
    title: string;
    subtitle?: string;
    initials?: string;
  };
  type: {
    labelKey: string;
    className: string;
  };
  placement: string;
  status: {
    labelKey: string;
    className: string;
  };
  startDate: string;
  endDate: string;
  actions: null;
};

interface DisplayTypeOption {
  labelKey: string;
  value: PromotionDisplayType;
  icon: string;
}

interface PlacementOption {
  labelKey: string;
  helperKey: string;
  value: string;
}

interface PaletteOption {
  labelKey: string;
  backgroundColor: string;
  textColor: string;
}

const EMPTY_PROMOTION_FORM: PromotionFormModel = {
  title: '',
  description: '',
  imageUrl: '',
  buttonText: '',
  buttonLink: '',
  placement: 'top_bar',
  displayType: 'bar',
  icon: '🎁',
  backgroundColor: '#6B7D5E',
  textColor: '#FFFFFF',
  isActive: true,
  startDate: '',
  endDate: '',
};

@Component({
  selector: 'app-promotions-ads',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableComponent,
    CommonModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './promotions-ads.component.html',
  styleUrl: './promotions-ads.component.css',
})
export class PromotionsAdsComponent implements OnInit {
  private readonly promotionsService = inject(PromotionsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly promotions = signal<Promotion[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly selectedType = signal<PromotionTypeFilter>('all');
  readonly selectedStatus = signal<PromotionStatusFilter>('all');
  readonly modalMode = signal<PromotionModalMode>('add');
  readonly selectedPromotion = signal<Promotion | null>(null);
  readonly promotionPendingDelete = signal<Promotion | null>(null);
  readonly isPromotionModalOpen = signal(false);
  readonly isDeleteModalOpen = signal(false);
  readonly formError = signal<string | null>(null);
  readonly promotionForm = signal<PromotionFormModel>({ ...EMPTY_PROMOTION_FORM });
  readonly selectedPromotionImageFile = signal<File | null>(null);
  readonly promotionImagePreview = signal<string | null>(null);
  readonly imageUploading = signal(false);
  readonly imageError = signal<string | null>(null);
  readonly imageWasCleared = signal(false);

  readonly displayTypeOptions: DisplayTypeOption[] = [
    { labelKey: 'PROMOTIONS_ADS.DISPLAY.ANNOUNCEMENT_BAR', value: 'bar', icon: 'pi pi-minus' },
    { labelKey: 'PROMOTIONS_ADS.DISPLAY.SECTION_BANNER', value: 'banner', icon: 'pi pi-table' },
    { labelKey: 'PROMOTIONS_ADS.DISPLAY.MODAL_POPUP', value: 'popup', icon: 'pi pi-desktop' },
  ];

  readonly placementOptionsByType: Record<PromotionDisplayType, PlacementOption[]> = {
    bar: [
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.TOP_ANNOUNCEMENT_BAR',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.TOP_ANNOUNCEMENT_BAR_HELPER',
        value: 'top_bar',
      },
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.BOTTOM_ANNOUNCEMENT_BAR',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.BOTTOM_ANNOUNCEMENT_BAR_HELPER',
        value: 'bottom_bar',
      },
    ],
    banner: [
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.HOMEPAGE_SECTION',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.HOMEPAGE_SECTION_HELPER',
        value: 'homepage',
      },
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.PRODUCT_PAGE',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.PRODUCT_PAGE_HELPER',
        value: 'product_page',
      },
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.CATEGORY_PAGE',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.CATEGORY_PAGE_HELPER',
        value: 'category_page',
      },
    ],
    popup: [
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.GLOBAL_POPUP',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.GLOBAL_POPUP_HELPER',
        value: 'global_popup',
      },
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.LOGGED_OUT_VISITOR_POPUP',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.LOGGED_OUT_VISITOR_POPUP_HELPER',
        value: 'logged_out_popup',
      },
      {
        labelKey: 'PROMOTIONS_ADS.PLACEMENTS.CART_POPUP',
        helperKey: 'PROMOTIONS_ADS.PLACEMENTS.CART_POPUP_HELPER',
        value: 'cart_popup',
      },
    ],
  };

  readonly paletteOptions: PaletteOption[] = [
    { labelKey: 'PROMOTIONS_ADS.PALETTES.OLIVE', backgroundColor: '#6B7D5E', textColor: '#FFFFFF' },
    { labelKey: 'PROMOTIONS_ADS.PALETTES.CHARCOAL', backgroundColor: '#2F2F2F', textColor: '#FFFFFF' },
    { labelKey: 'PROMOTIONS_ADS.PALETTES.BEIGE', backgroundColor: '#EFE4D6', textColor: '#1F2A1F' },
    { labelKey: 'PROMOTIONS_ADS.PALETTES.TAUPE', backgroundColor: '#D8C8B8', textColor: '#1F2A1F' },
    { labelKey: 'PROMOTIONS_ADS.PALETTES.CREAM', backgroundColor: '#F7F4EF', textColor: '#1F2A1F' },
    { labelKey: 'PROMOTIONS_ADS.PALETTES.FOREST', backgroundColor: '#445535', textColor: '#FFFFFF' },
  ];

  readonly iconOptions = ['🎁', '📱', '🌟', '🚚', '🛍️', '🔐', '🎉', '✨', '🛒', '💰', '🏷️', '❤️'];

  readonly typeOptions: SelectOption<PromotionTypeFilter>[] = [
    { label: 'PROMOTIONS_ADS.FILTERS.ALL_TYPES', value: 'all' },
    { label: 'PROMOTIONS_ADS.TYPE.BAR', value: 'bar' },
    { label: 'PROMOTIONS_ADS.TYPE.BANNER', value: 'banner' },
    { label: 'PROMOTIONS_ADS.TYPE.POPUP', value: 'popup' },
  ];

  readonly statusOptions: SelectOption<PromotionStatusFilter>[] = [
    { label: 'PROMOTIONS_ADS.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'PROMOTIONS_ADS.STATUS.ACTIVE', value: 'active' },
    { label: 'PROMOTIONS_ADS.STATUS.SCHEDULED', value: 'scheduled' },
    { label: 'PROMOTIONS_ADS.STATUS.EXPIRED', value: 'expired' },
    { label: 'PROMOTIONS_ADS.STATUS.INACTIVE', value: 'inactive' },
  ];

  readonly backgroundColorOptions: SelectOption[] = [
    { label: 'PROMOTIONS_ADS.COLORS.BEIGE', value: '#f7f4ef' },
    { label: 'PROMOTIONS_ADS.COLORS.WHITE', value: '#ffffff' },
    { label: 'PROMOTIONS_ADS.COLORS.SOFT_GREEN', value: '#eef4e8' },
    { label: 'PROMOTIONS_ADS.COLORS.SOFT_BLUE', value: '#eaf2ff' },
    { label: 'PROMOTIONS_ADS.COLORS.SOFT_YELLOW', value: '#fff6e7' },
    { label: 'PROMOTIONS_ADS.COLORS.SOFT_RED', value: '#fff1f0' },
    { label: 'PROMOTIONS_ADS.COLORS.DARK_GREEN', value: '#1f241d' },
  ];

  readonly textColorOptions: SelectOption[] = [
    { label: 'PROMOTIONS_ADS.COLORS.DARK_GREEN', value: '#1f2a1f' },
    { label: 'PROMOTIONS_ADS.COLORS.OLIVE_GREEN', value: '#5f6f43' },
    { label: 'PROMOTIONS_ADS.COLORS.MUTED_GRAY', value: '#8d877e' },
    { label: 'PROMOTIONS_ADS.COLORS.SUCCESS_GREEN', value: '#117047' },
    { label: 'PROMOTIONS_ADS.COLORS.BLUE', value: '#2f6fd0' },
    { label: 'PROMOTIONS_ADS.COLORS.ORANGE', value: '#a66309' },
    { label: 'PROMOTIONS_ADS.COLORS.RED', value: '#b42318' },
    { label: 'PROMOTIONS_ADS.COLORS.WHITE', value: '#ffffff' },
  ];

  readonly currentPlacementOptions = computed(() => this.placementOptionsByType[this.promotionForm().displayType]);

  readonly promotionTableColumns: AdminTableColumn[] = [
    { key: 'promotion', label: 'PROMOTIONS_ADS.TABLE.PROMOTION', type: 'imageText' },
    { key: 'type', label: 'PROMOTIONS_ADS.TABLE.TYPE', type: 'badge' },
    { key: 'placement', label: 'PROMOTIONS_ADS.TABLE.PLACEMENT', type: 'text' },
    { key: 'status', label: 'PROMOTIONS_ADS.TABLE.STATUS', type: 'badge' },
    { key: 'startDate', label: 'PROMOTIONS_ADS.TABLE.START_DATE', type: 'text' },
    { key: 'endDate', label: 'PROMOTIONS_ADS.TABLE.END_DATE', type: 'text' },
    { key: 'actions', label: 'PROMOTIONS_ADS.TABLE.ACTIONS', type: 'actions' },
  ];

  readonly stats = computed(() => this.promotionsService.getStatsFromPromotions(this.promotions()));

  readonly statusCounts = computed(() => {
    const counts: Record<PromotionStatus, number> = {
      active: 0,
      scheduled: 0,
      expired: 0,
      inactive: 0,
    };

    for (const promotion of this.promotions()) {
      counts[this.promotionStatus(promotion)] += 1;
    }

    return counts;
  });

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const promotions = this.promotions();
    const statusCounts = this.statusCounts();
    const typeBreakdown = this.typeBreakdown();
    const displayTypeCount = Object.values(typeBreakdown).filter((count) => count > 0).length;

    return [
      {
        title: 'Total Promotions',
        titleKey: 'PROMOTIONS_ADS.KPI.TOTAL',
        value: promotions.length.toString(),
        icon: 'pi pi-megaphone',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Active Now',
        titleKey: 'PROMOTIONS_ADS.KPI.ACTIVE_NOW',
        value: statusCounts.active.toString(),
        icon: 'pi pi-bolt',
        iconColor: '#20a464',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Scheduled',
        titleKey: 'PROMOTIONS_ADS.KPI.SCHEDULED',
        value: statusCounts.scheduled.toString(),
        icon: 'pi pi-calendar',
        iconColor: '#3b78d8',
        iconBg: '#eaf2ff',
        showChart: false,
      },
      {
        title: 'Inactive',
        titleKey: 'PROMOTIONS_ADS.KPI.INACTIVE',
        value: statusCounts.inactive.toString(),
        icon: 'pi pi-pause',
        iconColor: '#8d877e',
        iconBg: '#f0ebe4',
        showChart: false,
      },
      {
        title: 'Expired',
        titleKey: 'PROMOTIONS_ADS.KPI.EXPIRED',
        value: statusCounts.expired.toString(),
        icon: 'pi pi-clock',
        iconColor: '#b42318',
        iconBg: '#fff1f0',
        showChart: false,
      },
      {
        title: 'Display Types',
        titleKey: 'PROMOTIONS_ADS.KPI.DISPLAY_TYPES',
        value: displayTypeCount.toString(),
        icon: 'pi pi-th-large',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
    ];
  });

  readonly filteredPromotions = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedType = this.selectedType();
    const selectedStatus = this.selectedStatus();

    return this.promotions().filter((promotion) => {
      const searchable = [
        promotion.title,
        promotion.description ?? '',
        promotion.button_text ?? '',
        promotion.placement ?? '',
      ]
        .join(' ')
        .toLowerCase();
      const type = this.promotionType(promotion);
      const status = this.promotionStatus(promotion);

      return (
        (!searchTerm || searchable.includes(searchTerm)) &&
        (selectedType === 'all' || type === selectedType) &&
        (selectedStatus === 'all' || status === selectedStatus)
      );
    });
  });

  readonly tableRows = computed<PromotionTableRow[]>(() =>
    this.filteredPromotions().map((promotion) => this.toTableRow(promotion))
  );

  readonly livePromotions = computed(() =>
    this.promotions().filter((promotion) => this.promotionStatus(promotion) === 'active')
  );

  readonly activePlacementsCount = computed(
    () =>
      new Set(
        this.livePromotions()
          .map((promotion) => promotion.placement?.trim())
          .filter((placement): placement is string => !!placement)
      ).size
  );

  readonly typeBreakdown = computed(() => {
    const counts: Record<PromotionType, number> = { bar: 0, banner: 0, popup: 0 };
    for (const promotion of this.promotions()) {
      counts[this.promotionType(promotion)] += 1;
    }
    return counts;
  });

  readonly upcomingPromotion = computed(() =>
    this.promotions()
      .filter((promotion) => this.promotionStatus(promotion) === 'scheduled' && promotion.start_date)
      .sort((first, second) => new Date(first.start_date ?? '').getTime() - new Date(second.start_date ?? '').getTime())[0] ?? null
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
        this.translate.instant('PROMOTIONS_ADS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS_ADS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openCreatePromotionModal(): void {
    this.modalMode.set('add');
    this.selectedPromotion.set(null);
    this.formError.set(null);
    this.resetImageState();
    this.promotionForm.set({ ...EMPTY_PROMOTION_FORM });
    this.isPromotionModalOpen.set(true);
  }

  openEditPromotionModal(event: AdminTableRow | Promotion | string): void {
    const promotion = this.resolvePromotionFromTableEvent(event);

    if (!promotion) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.TOAST.INVALID_TITLE'),
        this.translate.instant('PROMOTIONS_ADS.TOAST.INVALID_DETAIL')
      );
      return;
    }

    this.modalMode.set('edit');
    this.selectedPromotion.set(promotion);
    this.formError.set(null);
    this.selectedPromotionImageFile.set(null);
    this.imageError.set(null);
    this.imageWasCleared.set(false);
    this.promotionImagePreview.set(promotion.image_url ?? null);
    this.promotionForm.set({
      title: promotion.title,
      description: promotion.description ?? '',
      imageUrl: promotion.image_url ?? '',
      buttonText: promotion.button_text ?? '',
      buttonLink: promotion.button_link ?? '',
      placement: promotion.placement ?? this.firstPlacementForType(this.promotionType(promotion)),
      displayType: this.promotionType(promotion),
      icon: promotion.icon ?? null,
      backgroundColor: promotion.background_color ?? '#6B7D5E',
      textColor: promotion.text_color ?? '#FFFFFF',
      isActive: promotion.is_active ?? true,
      startDate: this.toInputDate(promotion.start_date),
      endDate: this.toInputDate(promotion.end_date),
    });
    this.isPromotionModalOpen.set(true);
  }

  closePromotionModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.isPromotionModalOpen.set(false);
    this.selectedPromotion.set(null);
    this.formError.set(null);
    this.resetImageState();
    this.promotionForm.set({ ...EMPTY_PROMOTION_FORM });
  }

  openDeletePromotionModal(event: AdminTableRow | Promotion | string): void {
    const promotion = this.resolvePromotionFromTableEvent(event);

    if (!promotion) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.TOAST.INVALID_TITLE'),
        this.translate.instant('PROMOTIONS_ADS.TOAST.INVALID_DETAIL')
      );
      return;
    }

    this.promotionPendingDelete.set(promotion);
    this.isDeleteModalOpen.set(true);
  }

  closeDeletePromotionModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.isDeleteModalOpen.set(false);
    this.promotionPendingDelete.set(null);
  }

  updatePromotionForm<K extends keyof PromotionFormModel>(key: K, value: AdminFormFieldValue): void {
    this.promotionForm.update((form) => ({
      ...form,
      [key]: value,
    }));
  }

  selectDisplayType(displayType: PromotionDisplayType): void {
    this.promotionForm.update((form) => ({
      ...form,
      displayType,
      placement: this.firstPlacementForType(displayType),
      imageUrl: displayType === 'bar' ? '' : form.imageUrl,
    }));

    if (displayType === 'bar') {
      this.clearPromotionImage();
    }
  }

  selectPlacement(placement: string): void {
    this.updatePromotionForm('placement', placement);
  }

  applyPalette(palette: PaletteOption): void {
    this.promotionForm.update((form) => ({
      ...form,
      backgroundColor: palette.backgroundColor,
      textColor: palette.textColor,
    }));
  }

  selectIcon(icon: string): void {
    this.updatePromotionForm('icon', icon);
  }

  clearIcon(): void {
    this.updatePromotionForm('icon', null);
  }

  openPromotionImagePicker(input: HTMLInputElement, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.saving() || this.imageUploading()) {
      return;
    }

    input.value = '';
    input.click();
  }

  onPromotionImageSelected(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.imageError.set('PROMOTIONS_ADS.ERRORS.INVALID_IMAGE_TYPE');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.imageError.set('PROMOTIONS_ADS.ERRORS.IMAGE_TOO_LARGE');
      return;
    }

    this.revokeObjectPreview();
    this.selectedPromotionImageFile.set(file);
    this.promotionImagePreview.set(URL.createObjectURL(file));
    this.imageWasCleared.set(false);
    this.imageError.set(null);
  }

  clearPromotionImage(): void {
    this.revokeObjectPreview();
    this.selectedPromotionImageFile.set(null);
    this.promotionImagePreview.set(null);
    this.imageWasCleared.set(true);
    this.imageError.set(null);
    this.updatePromotionForm('imageUrl', '');
  }

  updatePromotionImageUrl(value: AdminFormFieldValue): void {
    const imageUrl = typeof value === 'string' ? value : '';

    this.revokeObjectPreview();
    this.selectedPromotionImageFile.set(null);
    this.promotionImagePreview.set(imageUrl || null);
    this.imageWasCleared.set(!imageUrl);
    this.imageError.set(null);
    this.updatePromotionForm('imageUrl', imageUrl);
  }

  currentFormStatus(): PromotionStatus {
    const form = this.promotionForm();

    if (!form.isActive) {
      return 'inactive';
    }

    if (form.startDate && new Date(form.startDate) > new Date()) {
      return 'scheduled';
    }

    return 'active';
  }

  selectFormStatus(status: PromotionStatus): void {
    if (status === 'inactive') {
      this.updatePromotionForm('isActive', false);
      return;
    }

    if (status === 'scheduled') {
      const currentStartDate = this.promotionForm().startDate;
      const currentStartTime = currentStartDate ? new Date(currentStartDate).getTime() : 0;

      this.promotionForm.update((form) => ({
        ...form,
        isActive: true,
        startDate: currentStartTime > Date.now() ? form.startDate : this.tomorrowInputDate(),
      }));
      return;
    }

    this.promotionForm.update((form) => ({
      ...form,
      isActive: true,
      startDate: form.startDate && new Date(form.startDate).getTime() > Date.now() ? '' : form.startDate,
    }));
  }

  async savePromotion(): Promise<void> {
    const payload = this.buildPayload();

    if (!payload) {
      return;
    }

    this.saving.set(true);

    try {
      const selectedImageFile = this.selectedPromotionImageFile();

      if (selectedImageFile) {
        this.imageUploading.set(true);
        payload.image_url = await this.promotionsService.uploadPromotionImage(selectedImageFile);
      } else if (this.imageWasCleared() || payload.display_type === 'bar') {
        payload.image_url = null;
      }

      if (this.modalMode() === 'edit') {
        const promotion = this.selectedPromotion();

        if (!promotion) {
          this.formError.set('PROMOTIONS_ADS.TOAST.MISSING_PROMOTION');
          return;
        }

        const updatedPromotion = await this.promotionsService.updatePromotion(promotion.id, payload);
        this.promotions.update((items) =>
          items.map((item) => (item.id === updatedPromotion.id ? updatedPromotion : item))
        );
        await this.deleteOldPromotionImageIfNeeded(promotion.image_url, updatedPromotion.image_url);
        this.toast.updated(this.translate.instant('PROMOTIONS_ADS.PROMOTION'));
      } else {
        const createdPromotion = await this.promotionsService.createPromotion(payload);
        this.promotions.update((items) => [createdPromotion, ...items]);
        this.searchTerm.set('');
        this.selectedStatus.set('all');
        this.selectedType.set('all');
        this.toast.created(this.translate.instant('PROMOTIONS_ADS.PROMOTION'));
      }

      this.closePromotionModal(true);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.TOAST.SAVE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS_ADS.ERRORS.IMAGE_UPLOAD_FAILED'))
      );
    } finally {
      this.imageUploading.set(false);
      this.saving.set(false);
    }
  }

  async confirmDeletePromotion(): Promise<void> {
    const promotion = this.promotionPendingDelete();

    if (!promotion) {
      return;
    }

    this.saving.set(true);

    try {
      await this.promotionsService.deletePromotion(promotion.id);
      this.promotions.update((items) => items.filter((item) => item.id !== promotion.id));
      this.toast.deleted(this.translate.instant('PROMOTIONS_ADS.PROMOTION'));
      this.closeDeletePromotionModal(true);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.TOAST.DELETE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS_ADS.TOAST.DELETE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  async togglePromotionActive(row: AdminTableRow): Promise<void> {
    const promotion = row.raw as Promotion | null;
    if (!promotion) {
      return;
    }

    try {
      const updatedPromotion = await this.promotionsService.updatePromotion(promotion.id, {
        is_active: !(promotion.is_active ?? true),
      });
      this.promotions.update((items) =>
        items.map((item) => (item.id === updatedPromotion.id ? updatedPromotion : item))
      );
      this.toast.success(this.translate.instant('PROMOTIONS_ADS.TOAST.STATUS_UPDATED'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.TOAST.STATUS_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PROMOTIONS_ADS.TOAST.STATUS_FAILED_DETAIL'))
      );
    }
  }

  promotionStatus(promotion: Promotion): PromotionStatus {
    return this.promotionsService.getPromotionStatus(promotion);
  }

  promotionType(promotion: Promotion): PromotionType {
    return this.promotionsService.getPromotionType(promotion);
  }

  modalTitle(): string {
    return this.modalMode() === 'edit' ? 'PROMOTIONS_ADS.MODAL.EDIT_TITLE' : 'PROMOTIONS_ADS.MODAL.CREATE_TITLE';
  }

  modalSubtitle(): string {
    return this.modalMode() === 'edit'
      ? 'PROMOTIONS_ADS.MODAL.EDIT_SUBTITLE'
      : 'PROMOTIONS_ADS.MODAL.CREATE_SUBTITLE';
  }

  deletePromotionMessage(): string {
    const name = this.promotionPendingDelete()?.title ?? '';
    return this.translate.instant('PROMOTIONS_ADS.DELETE_MESSAGE', { name });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return this.translate.instant('PROMOTIONS_ADS.NOT_SET');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.translate.instant('PROMOTIONS_ADS.NOT_SET');
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  typeLabelKey(type: PromotionType): string {
    return `PROMOTIONS_ADS.TYPE.${type.toUpperCase()}`;
  }

  private toTableRow(promotion: Promotion): PromotionTableRow {
    const type = this.promotionType(promotion);
    const status = this.promotionStatus(promotion);

    return {
      id: promotion.id,
      raw: promotion,
      promotion: {
        imageUrl: promotion.image_url?.trim() || null,
        imageFallbackLabel: 'PROMOTIONS_ADS.IMAGE_OPTIONAL',
        title: promotion.title,
        subtitle: this.promotionTableSubtitle(promotion),
        initials: promotion.icon ?? this.initials(promotion.title),
      },
      type: {
        labelKey: this.typeLabelKey(type),
        className: this.typeBadgeClass(type),
      },
      placement: this.placementLabel(promotion.placement),
      status: {
        labelKey: `PROMOTIONS_ADS.STATUS.${status.toUpperCase()}`,
        className: this.statusBadgeClass(status),
      },
      startDate: this.formatDate(promotion.start_date),
      endDate: this.formatDate(promotion.end_date),
      actions: null,
    };
  }

  private resolvePromotionFromTableEvent(event: AdminTableRow | Promotion | string | null | undefined): Promotion | null {
    if (!event) {
      return null;
    }

    if (typeof event === 'string') {
      return this.promotions().find((promotion) => promotion.id === event) ?? null;
    }

    const maybePromotion = event as Promotion;

    if (maybePromotion.id && maybePromotion.title && 'display_type' in maybePromotion) {
      return maybePromotion;
    }

    const row = event as AdminTableRow & { raw?: Promotion | null; id?: string };

    if (row.raw?.id) {
      return row.raw;
    }

    if (row.id) {
      return this.promotions().find((promotion) => promotion.id === row.id) ?? null;
    }

    return null;
  }

  private promotionTableSubtitle(promotion: Promotion): string {
    const type = this.translate.instant(this.typeLabelKey(this.promotionType(promotion)));
    const placement = this.placementLabel(promotion.placement);
    const meta = [type, placement].filter(Boolean).join(' · ');
    const details = [promotion.description, meta]
      .map((value) => value?.trim())
      .filter(Boolean);

    return details.join(' · ');
  }

  private promotionSubtitle(promotion: Promotion): string {
    const details = [promotion.description, promotion.button_text, promotion.button_link]
      .map((value) => value?.trim())
      .filter(Boolean);

    return details.join(' · ');
  }

  placementLabel(value: string | null | undefined): string {
    if (!value) {
      return this.translate.instant('PROMOTIONS_ADS.NOT_SET');
    }

    const option = Object.values(this.placementOptionsByType)
      .flat()
      .find((item) => item.value === value);

    return option ? this.translate.instant(option.labelKey) : value;
  }

  private buildPayload(): PromotionMutationPayload | null {
    const form = this.promotionForm();
    const title = form.title.trim();
    const description = form.description.trim();
    const placement = form.placement.trim();
    const buttonLink = form.buttonLink.trim();
    const startDate = form.startDate || null;
    const endDate = form.endDate || null;

    if (!title) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.TITLE_REQUIRED');
      return null;
    }

    if (!description) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.MESSAGE_REQUIRED');
      return null;
    }

    if (!form.displayType) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.DISPLAY_TYPE_REQUIRED');
      return null;
    }

    if (!placement) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.PLACEMENT_REQUIRED');
      return null;
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.END_BEFORE_START');
      return null;
    }

    if (buttonLink && !this.isValidLink(buttonLink)) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.INVALID_LINK');
      return null;
    }

    if (!this.isValidHexColor(form.backgroundColor) || !this.isValidHexColor(form.textColor)) {
      this.formError.set('PROMOTIONS_ADS.ERRORS.INVALID_COLOR');
      return null;
    }

    this.formError.set(null);

    return {
      title,
      description,
      image_url: form.imageUrl.trim() || null,
      button_text: form.buttonText.trim() || null,
      button_link: buttonLink || null,
      placement,
      display_type: form.displayType,
      icon: form.icon,
      background_color: form.backgroundColor.trim() || null,
      text_color: form.textColor.trim() || null,
      is_active: form.isActive,
      start_date: startDate,
      end_date: endDate,
    };
  }

  private isValidLink(value: string): boolean {
    if (value.startsWith('/')) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isValidHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
  }

  private toInputDate(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private tomorrowInputDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  private resetImageState(): void {
    this.revokeObjectPreview();
    this.selectedPromotionImageFile.set(null);
    this.promotionImagePreview.set(null);
    this.imageUploading.set(false);
    this.imageError.set(null);
    this.imageWasCleared.set(false);
  }

  private revokeObjectPreview(): void {
    const preview = this.promotionImagePreview();

    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  }

  private initials(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  typeBadgeClass(type: PromotionType): string {
    const classes: Record<PromotionType, string> = {
      bar: 'bg-[#f0ebe4] text-[#675f55]',
      banner: 'bg-[#eaf2ff] text-[#2f6fd0]',
      popup: 'bg-[#fff6e7] text-[#a66309]',
    };

    return classes[type];
  }

  private firstPlacementForType(displayType: PromotionDisplayType): string {
    return this.placementOptionsByType[displayType][0]?.value ?? 'top_bar';
  }

  private statusBadgeClass(status: PromotionStatus): string {
    const classes: Record<PromotionStatus, string> = {
      active: 'bg-[#e9f8ef] text-[#117047]',
      scheduled: 'bg-[#eaf2ff] text-[#2f6fd0]',
      expired: 'bg-[#f0ebe4] text-[#675f55]',
      inactive: 'bg-[#fff6e7] text-[#a66309]',
    };

    return classes[status];
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private async deleteOldPromotionImageIfNeeded(
    previousImageUrl: string | null | undefined,
    nextImageUrl: string | null | undefined
  ): Promise<void> {
    if (!previousImageUrl || previousImageUrl === nextImageUrl) {
      return;
    }

    try {
      await this.promotionsService.deletePromotionImageByUrl(previousImageUrl);
    } catch {
      // Image cleanup should not roll back an already-saved promotion update.
    }
  }
}
