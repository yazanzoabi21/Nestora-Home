import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../../core/services';
import {
  CustomerOffer,
  CustomerOfferAudience,
  CustomerOfferMutationPayload,
  CustomerOffersService,
  CustomerOfferStatus,
  CustomerOfferType,
  Discount,
  DiscountsService,
} from '../../../../data-access';
import {
  AdminFormFieldComponent,
  AdminFormFieldValue,
} from '../../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../../shared/ui/admin-form-modal';
import {
  AdminTableCellTemplateDirective,
  AdminTableColumn,
  AdminTableComponent,
  AdminTableRow,
} from '../../../../shared/ui/admin-table';

type CustomerOfferModalMode = 'add' | 'edit';
type CustomerOfferTypeFilter = 'all' | CustomerOfferType;
type CustomerOfferAudienceFilter = 'all' | CustomerOfferAudience;
type CustomerOfferStatusFilter = 'all' | CustomerOfferStatus;

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

interface CustomerOfferFormModel {
  slug: string;
  discountId: string | null;
  offerType: CustomerOfferType;
  audience: CustomerOfferAudience;
  icon: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  badgeEn: string;
  badgeAr: string;
  actionTextEn: string;
  actionTextAr: string;
  actionLink: string;
  backgroundColor: string;
  buttonColor: string;
  showDiscountCode: boolean;
  sortOrder: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

type CustomerOfferTableRow = AdminTableRow & {
  offer: {
    imageUrl: string;
    title: string;
    subtitle: string;
    avatarBackground: string;
    avatarTextColor: string;
  };
  type: { labelKey: string; className: string };
  audience: { labelKey: string; className: string };
  status: { labelKey: string; className: string };
  order: number;
  actions: null;
};

const EMPTY_FORM: CustomerOfferFormModel = {
  slug: '',
  discountId: null,
  offerType: 'marketing',
  audience: 'all',
  icon: 'pi pi-gift',
  titleEn: '',
  titleAr: '',
  descriptionEn: '',
  descriptionAr: '',
  badgeEn: '',
  badgeAr: '',
  actionTextEn: '',
  actionTextAr: '',
  actionLink: '',
  backgroundColor: '#eef4e9',
  buttonColor: '#526148',
  showDiscountCode: false,
  sortOrder: 0,
  isActive: true,
  startDate: '',
  endDate: '',
};

@Component({
  selector: 'app-customer-offers-admin',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableCellTemplateDirective,
    AdminTableComponent,
    TranslatePipe,
  ],
  templateUrl: './customer-offers-admin.component.html',
  styleUrl: './customer-offers-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerOffersAdminComponent {
  private readonly offersService = inject(CustomerOffersService);
  private readonly discountsService = inject(DiscountsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly offers = signal<CustomerOffer[]>([]);
  readonly discounts = signal<Discount[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly selectedType = signal<CustomerOfferTypeFilter>('all');
  readonly selectedAudience = signal<CustomerOfferAudienceFilter>('all');
  readonly selectedStatus = signal<CustomerOfferStatusFilter>('all');
  readonly modalMode = signal<CustomerOfferModalMode>('add');
  readonly selectedOffer = signal<CustomerOffer | null>(null);
  readonly pendingDelete = signal<CustomerOffer | null>(null);
  readonly form = signal<CustomerOfferFormModel>({ ...EMPTY_FORM });
  readonly formError = signal<string | null>(null);
  readonly isFormOpen = signal(false);
  readonly isDeleteOpen = signal(false);

  readonly offerTypeOptions: SelectOption<CustomerOfferType>[] = [
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.DISCOUNT', value: 'discount' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.REFERRAL', value: 'referral' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.APP', value: 'app' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.LOYALTY', value: 'loyalty' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.MARKETING', value: 'marketing' },
  ];

  readonly audienceOptions: SelectOption<CustomerOfferAudience>[] = [
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.AUDIENCES.ALL', value: 'all' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.AUDIENCES.GUEST', value: 'guest' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.AUDIENCES.CUSTOMER', value: 'customer' },
    {
      label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.AUDIENCES.NEW_CUSTOMER',
      value: 'new_customer',
    },
  ];

  readonly typeFilterOptions: SelectOption<CustomerOfferTypeFilter>[] = [
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.FILTERS.ALL_TYPES', value: 'all' },
    ...this.offerTypeOptions,
  ];

  readonly audienceFilterOptions: SelectOption<CustomerOfferAudienceFilter>[] = [
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.FILTERS.ALL_AUDIENCES', value: 'all' },
    ...this.audienceOptions,
  ];

  readonly statusFilterOptions: SelectOption<CustomerOfferStatusFilter>[] = [
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.STATUSES.ACTIVE', value: 'active' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.STATUSES.SCHEDULED', value: 'scheduled' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.STATUSES.EXPIRED', value: 'expired' },
    { label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.STATUSES.INACTIVE', value: 'inactive' },
  ];

  readonly iconOptions = [
    'pi pi-gift',
    'pi pi-tag',
    'pi pi-percentage',
    'pi pi-users',
    'pi pi-mobile',
    'pi pi-star',
    'pi pi-heart',
    'pi pi-bolt',
    'pi pi-megaphone',
    'pi pi-shopping-bag',
    'pi pi-ticket',
    'pi pi-crown',
  ];

  readonly columns: AdminTableColumn[] = [
    { key: 'offer', label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TABLE.OFFER', type: 'imageText' },
    { key: 'type', label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TABLE.TYPE', type: 'badge' },
    {
      key: 'audience',
      label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TABLE.AUDIENCE',
      type: 'badge',
    },
    { key: 'status', label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TABLE.STATUS', type: 'badge' },
    { key: 'order', label: 'PROMOTIONS_ADS.CUSTOMER_OFFERS.TABLE.ORDER', type: 'number' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  readonly discountOptions = computed(() =>
    this.discounts().map((discount) => ({
      label: `${discount.code} · ${discount.name}`,
      value: discount.id,
    })),
  );

  readonly statusCounts = computed(() => {
    const counts: Record<CustomerOfferStatus, number> = {
      active: 0,
      scheduled: 0,
      expired: 0,
      inactive: 0,
    };
    for (const offer of this.offers()) counts[this.offerStatus(offer)] += 1;
    return counts;
  });

  readonly filteredOffers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const type = this.selectedType();
    const audience = this.selectedAudience();
    const status = this.selectedStatus();

    return this.offers().filter((offer) => {
      const searchable = [
        offer.slug,
        offer.title_en,
        offer.title_ar,
        offer.description_en ?? '',
        offer.description_ar ?? '',
        offer.discount?.code ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!search || searchable.includes(search)) &&
        (type === 'all' || offer.offer_type === type) &&
        (audience === 'all' || offer.audience === audience) &&
        (status === 'all' || this.offerStatus(offer) === status)
      );
    });
  });

  readonly tableRows = computed<CustomerOfferTableRow[]>(() =>
    this.filteredOffers().map((offer) => this.toTableRow(offer)),
  );

  constructor() {
    void this.load();
  }

  openCreate(): void {
    this.modalMode.set('add');
    this.selectedOffer.set(null);
    this.form.set({ ...EMPTY_FORM, sortOrder: this.nextSortOrder() });
    this.formError.set(null);
    this.isFormOpen.set(true);
  }

  openEdit(event: AdminTableRow | CustomerOffer): void {
    const offer = this.resolveOffer(event);
    if (!offer) return;

    this.modalMode.set('edit');
    this.selectedOffer.set(offer);
    this.form.set({
      slug: offer.slug,
      discountId: offer.discount_id,
      offerType: offer.offer_type,
      audience: offer.audience,
      icon: offer.icon ?? 'pi pi-gift',
      titleEn: offer.title_en,
      titleAr: offer.title_ar,
      descriptionEn: offer.description_en ?? '',
      descriptionAr: offer.description_ar ?? '',
      badgeEn: offer.badge_en ?? '',
      badgeAr: offer.badge_ar ?? '',
      actionTextEn: offer.action_text_en ?? '',
      actionTextAr: offer.action_text_ar ?? '',
      actionLink: offer.action_link ?? '',
      backgroundColor: offer.background_color,
      buttonColor: offer.button_color,
      showDiscountCode: offer.show_discount_code,
      sortOrder: offer.sort_order,
      isActive: offer.is_active,
      startDate: this.toInputDate(offer.start_date),
      endDate: this.toInputDate(offer.end_date),
    });
    this.formError.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(force = false): void {
    if (this.saving() && !force) return;
    this.isFormOpen.set(false);
    this.selectedOffer.set(null);
    this.formError.set(null);
  }

  updateForm<K extends keyof CustomerOfferFormModel>(key: K, value: AdminFormFieldValue): void {
    this.form.update((form) => ({ ...form, [key]: value }));
  }

  selectOfferType(offerType: CustomerOfferType): void {
    this.form.update((form) => ({
      ...form,
      offerType,
      discountId: offerType === 'discount' ? form.discountId : null,
      showDiscountCode: offerType === 'discount' && form.showDiscountCode,
    }));
  }

  selectIcon(icon: string): void {
    this.form.update((form) => ({ ...form, icon }));
  }

  async save(): Promise<void> {
    const payload = this.buildPayload();
    if (!payload) return;

    this.saving.set(true);
    try {
      if (this.modalMode() === 'edit') {
        const offer = this.selectedOffer();
        if (!offer) return;
        const updated = await this.offersService.updateCustomerOffer(offer.id, payload);
        this.offers.update((offers) =>
          offers.map((current) => (current.id === updated.id ? updated : current)),
        );
        this.toast.success(this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.UPDATED'));
      } else {
        const created = await this.offersService.createCustomerOffer(payload);
        this.offers.update((offers) => [...offers, created]);
        this.toast.success(this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.CREATED'));
      }
      this.sortOffers();
      this.closeForm(true);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.SAVE_FAILED'),
        this.errorMessage(error),
      );
    } finally {
      this.saving.set(false);
    }
  }

  openDelete(event: AdminTableRow | CustomerOffer): void {
    const offer = this.resolveOffer(event);
    if (!offer) return;
    this.pendingDelete.set(offer);
    this.isDeleteOpen.set(true);
  }

  closeDelete(force = false): void {
    if (this.saving() && !force) return;
    this.isDeleteOpen.set(false);
    this.pendingDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const offer = this.pendingDelete();
    if (!offer) return;

    this.saving.set(true);
    try {
      await this.offersService.deleteCustomerOffer(offer.id);
      this.offers.update((offers) => offers.filter((current) => current.id !== offer.id));
      this.toast.success(this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.DELETED'));
      this.closeDelete(true);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.DELETE_FAILED'),
        this.errorMessage(error),
      );
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(event: AdminTableRow | CustomerOffer): Promise<void> {
    const offer = this.resolveOffer(event);
    if (!offer) return;

    try {
      const updated = await this.offersService.toggleCustomerOfferStatus(
        offer.id,
        !offer.is_active,
      );
      this.offers.update((offers) =>
        offers.map((current) => (current.id === updated.id ? updated : current)),
      );
      this.toast.success(
        this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.STATUS_UPDATED'),
      );
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.STATUS_FAILED'),
        this.errorMessage(error),
      );
    }
  }

  offerStatus(offer: CustomerOffer): CustomerOfferStatus {
    return this.offersService.getCustomerOfferStatus(offer);
  }

  isOfferActive(event: AdminTableRow | CustomerOffer): boolean {
    return this.resolveOffer(event)?.is_active === true;
  }

  deleteMessage(): string {
    return this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.DELETE.MESSAGE', {
      name: this.pendingDelete()?.title_en ?? '',
    });
  }

  formTitle(): string {
    return this.modalMode() === 'edit'
      ? 'PROMOTIONS_ADS.CUSTOMER_OFFERS.FORM.EDIT_TITLE'
      : 'PROMOTIONS_ADS.CUSTOMER_OFFERS.FORM.CREATE_TITLE';
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [offers, discounts] = await Promise.all([
        this.offersService.getCustomerOffersForAdmin(),
        this.discountsService.getDiscounts(),
      ]);
      this.offers.set(offers);
      this.discounts.set(discounts);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PROMOTIONS_ADS.CUSTOMER_OFFERS.TOAST.LOAD_FAILED'),
        this.errorMessage(error),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private buildPayload(): CustomerOfferMutationPayload | null {
    const form = this.form();
    const slug = form.slug.trim().toLowerCase();
    const actionLink = form.actionLink.trim();
    const startDate = form.startDate || null;
    const endDate = form.endDate || null;

    if (!form.titleEn.trim()) return this.invalid('TITLE_EN_REQUIRED');
    if (!form.titleAr.trim()) return this.invalid('TITLE_AR_REQUIRED');
    if (!slug) return this.invalid('SLUG_REQUIRED');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return this.invalid('INVALID_SLUG');
    if (Number(form.sortOrder) < 0) return this.invalid('NEGATIVE_ORDER');
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return this.invalid('END_BEFORE_START');
    }
    if (!this.isValidHexColor(form.backgroundColor) || !this.isValidHexColor(form.buttonColor)) {
      return this.invalid('INVALID_COLOR');
    }
    if (actionLink && !this.isValidLink(actionLink)) return this.invalid('INVALID_LINK');

    this.formError.set(null);
    return {
      slug,
      discount_id: form.offerType === 'discount' ? form.discountId : null,
      offer_type: form.offerType,
      audience: form.audience,
      icon: form.icon.trim() || null,
      title_en: form.titleEn.trim(),
      title_ar: form.titleAr.trim(),
      description_en: form.descriptionEn.trim() || null,
      description_ar: form.descriptionAr.trim() || null,
      badge_en: form.badgeEn.trim() || null,
      badge_ar: form.badgeAr.trim() || null,
      action_text_en: form.actionTextEn.trim() || null,
      action_text_ar: form.actionTextAr.trim() || null,
      action_link: actionLink || null,
      background_color: form.backgroundColor.trim(),
      button_color: form.buttonColor.trim(),
      show_discount_code: form.offerType === 'discount' && form.showDiscountCode,
      sort_order: Math.max(0, Math.trunc(Number(form.sortOrder) || 0)),
      is_active: form.isActive,
      start_date: startDate,
      end_date: endDate,
    };
  }

  private invalid(key: string): null {
    this.formError.set(`PROMOTIONS_ADS.CUSTOMER_OFFERS.VALIDATION.${key}`);
    return null;
  }

  private toTableRow(offer: CustomerOffer): CustomerOfferTableRow {
    const status = this.offerStatus(offer);
    return {
      id: offer.id,
      raw: offer,
      offer: {
        imageUrl: offer.icon ?? 'pi pi-gift',
        title: offer.title_en,
        subtitle: offer.discount?.code ? `${offer.slug} · ${offer.discount.code}` : offer.slug,
        avatarBackground: offer.background_color,
        avatarTextColor: offer.button_color,
      },
      type: {
        labelKey: `PROMOTIONS_ADS.CUSTOMER_OFFERS.TYPES.${offer.offer_type.toUpperCase()}`,
        className: 'bg-[#eef4e8] text-[#526148]',
      },
      audience: {
        labelKey: `PROMOTIONS_ADS.CUSTOMER_OFFERS.AUDIENCES.${offer.audience.toUpperCase()}`,
        className: 'bg-[#eaf2ff] text-[#2f6fd0]',
      },
      status: {
        labelKey: `PROMOTIONS_ADS.CUSTOMER_OFFERS.STATUSES.${status.toUpperCase()}`,
        className: this.statusClass(status),
      },
      order: offer.sort_order,
      actions: null,
    };
  }

  private resolveOffer(event: AdminTableRow | CustomerOffer): CustomerOffer | null {
    if ('offer_type' in event) return event as CustomerOffer;
    return (event.raw as CustomerOffer | undefined) ?? null;
  }

  private nextSortOrder(): number {
    return Math.max(-1, ...this.offers().map((offer) => offer.sort_order)) + 1;
  }

  private sortOffers(): void {
    this.offers.update((offers) =>
      [...offers].sort(
        (first, second) =>
          first.sort_order - second.sort_order ||
          (second.created_at ?? '').localeCompare(first.created_at ?? ''),
      ),
    );
  }

  private statusClass(status: CustomerOfferStatus): string {
    const classes: Record<CustomerOfferStatus, string> = {
      active: 'bg-[#e9f8ef] text-[#117047]',
      scheduled: 'bg-[#eaf2ff] text-[#2f6fd0]',
      expired: 'bg-[#f0ebe4] text-[#675f55]',
      inactive: 'bg-[#fff6e7] text-[#a66309]',
    };
    return classes[status];
  }

  private isValidHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
  }

  private isValidLink(value: string): boolean {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private toInputDate(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '';
  }
}
