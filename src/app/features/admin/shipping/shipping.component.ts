import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../core/services';
import { AdminSidebarBadgesService } from '../../../core/services/navigation';
import {
  DeliveryZone,
  DeliveryZonePayload,
  ShippingMethod,
  ShippingMethodPayload,
  ShippingMethodZone,
  ShippingMethodZonePayload,
  ShippingService,
} from '../../../data-access';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import {
  AdminTableCellTemplateDirective,
  AdminTableColumn,
  AdminTableComponent,
  AdminTableRow,
} from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type ShippingTab = 'methods' | 'zones' | 'methodZones';
type DeleteTarget = 'method' | 'zone' | 'methodZone';

interface SelectOption<T extends string | null = string> {
  label: string;
  value: T;
}

interface PendingDelete {
  type: DeleteTarget;
  id: string;
  label: string;
}

interface MethodForm {
  id: string | null;
  name: string;
  code: string;
  carrier_name: string;
  description: string;
  icon: string;
  base_cost: number | null;
  free_shipping_min_amount: number | null;
  eta_min_days: number | null;
  eta_max_days: number | null;
  eta_label: string;
  is_active: boolean;
  sort_order: number | null;
}

interface ZoneForm {
  id: string | null;
  name: string;
  country: string;
  cities: string;
  areas: string;
  extra_cost: number | null;
  is_active: boolean;
}

interface MethodZoneForm {
  id: string | null;
  shipping_method_id: string | null;
  delivery_zone_id: string | null;
  cost_override: number | null;
  free_shipping_min_amount_override: number | null;
  eta_min_days_override: number | null;
  eta_max_days_override: number | null;
  eta_label_override: string;
  is_active: boolean;
}

type DeliveryZoneTableRow = AdminTableRow & {
  raw: DeliveryZone;
};

type MethodZoneTableRow = AdminTableRow & {
  raw: ShippingMethodZone;
};

const DEFAULT_METHOD_FORM: MethodForm = {
  id: null,
  name: '',
  code: '',
  carrier_name: '',
  description: '',
  icon: 'pi pi-truck',
  base_cost: 0,
  free_shipping_min_amount: null,
  eta_min_days: null,
  eta_max_days: null,
  eta_label: '',
  is_active: true,
  sort_order: null,
};

const DEFAULT_ZONE_FORM: ZoneForm = {
  id: null,
  name: '',
  country: '',
  cities: '',
  areas: '',
  extra_cost: 0,
  is_active: true,
};

const DEFAULT_METHOD_ZONE_FORM: MethodZoneForm = {
  id: null,
  shipping_method_id: null,
  delivery_zone_id: null,
  cost_override: null,
  free_shipping_min_amount_override: null,
  eta_min_days_override: null,
  eta_max_days_override: null,
  eta_label_override: '',
  is_active: true,
};

@Component({
  selector: 'app-shipping',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableCellTemplateDirective,
    AdminTableComponent,
    CommonModule,
    FormsModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './shipping.component.html',
  styleUrl: './shipping.component.css',
})
export class ShippingComponent implements OnInit {
  private readonly shippingService = inject(ShippingService);
  private readonly sidebarBadges = inject(AdminSidebarBadgesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly methods = signal<ShippingMethod[]>([]);
  readonly zones = signal<DeliveryZone[]>([]);
  readonly methodZones = signal<ShippingMethodZone[]>([]);
  readonly activeTab = signal<ShippingTab>('methods');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly togglingMethodIds = signal<Set<string>>(new Set());
  readonly methodModalOpen = signal(false);
  readonly zoneModalOpen = signal(false);
  readonly methodZoneModalOpen = signal(false);
  readonly deleteModalOpen = signal(false);
  readonly methodForm = signal<MethodForm>({ ...DEFAULT_METHOD_FORM });
  readonly zoneForm = signal<ZoneForm>({ ...DEFAULT_ZONE_FORM });
  readonly methodZoneForm = signal<MethodZoneForm>({ ...DEFAULT_METHOD_ZONE_FORM });
  readonly pendingDelete = signal<PendingDelete | null>(null);

  readonly tabs: SelectOption<ShippingTab>[] = [
    { label: 'SHIPPING.TABS.METHODS', value: 'methods' },
    { label: 'SHIPPING.TABS.ZONES', value: 'zones' },
    { label: 'SHIPPING.TABS.METHOD_ZONES', value: 'methodZones' },
  ];

  readonly deliveryZoneColumns: AdminTableColumn[] = [
    { key: 'zone', label: 'SHIPPING.TABLE.ZONE', type: 'text' },
    { key: 'regions', label: 'SHIPPING.TABLE.REGIONS', type: 'text' },
    { key: 'surcharge', label: 'SHIPPING.TABLE.SURCHARGE', type: 'text' },
    { key: 'status', label: 'SHIPPING.TABLE.STATUS', type: 'status' },
    { key: 'actions', label: 'SHIPPING.TABLE.ACTIONS', type: 'actions' },
  ];

  readonly methodZoneColumns: AdminTableColumn[] = [
    { key: 'shippingMethod', label: 'SHIPPING.TABLE.SHIPPING_METHOD', type: 'text' },
    { key: 'deliveryZone', label: 'SHIPPING.TABLE.DELIVERY_ZONE', type: 'text' },
    { key: 'costOverride', label: 'SHIPPING.TABLE.COST_OVERRIDE', type: 'text' },
    { key: 'freeShippingOverride', label: 'SHIPPING.TABLE.FREE_SHIPPING_OVERRIDE', type: 'text' },
    { key: 'etaOverride', label: 'SHIPPING.TABLE.ETA_OVERRIDE', type: 'text' },
    { key: 'status', label: 'SHIPPING.TABLE.STATUS', type: 'status' },
    { key: 'actions', label: 'SHIPPING.TABLE.ACTIONS', type: 'actions' },
  ];

  readonly methodOptions = computed<SelectOption[]>(() =>
    this.methods().map((method) => ({ label: method.name, value: method.id }))
  );

  readonly zoneOptions = computed<SelectOption[]>(() =>
    this.zones().map((zone) => ({ label: zone.name, value: zone.id }))
  );

  readonly stats = computed(() => this.shippingService.getShippingStats(this.methods(), this.zones()));

  readonly deliveryZoneRows = computed<DeliveryZoneTableRow[]>(() =>
    this.zones().map((zone) => ({
      id: zone.id,
      zone: zone.name,
      regions: this.zoneRegions(zone).join(', '),
      surcharge: zone.extra_cost > 0 ? `+${this.formatCurrency(zone.extra_cost)}` : this.translate.instant('SHIPPING.ZONE.NO_SURCHARGE'),
      status: {
        labelKey: zone.is_active ? 'SHIPPING.STATUS.ACTIVE' : 'SHIPPING.STATUS.INACTIVE',
        className: this.statusClass(zone.is_active),
      },
      raw: zone,
    }))
  );

  readonly methodZoneRows = computed<MethodZoneTableRow[]>(() =>
    this.methodZones().map((item) => ({
      id: item.id,
      shippingMethod: item.shipping_method?.name || this.methodName(item.shipping_method_id),
      deliveryZone: item.delivery_zone?.name || this.zoneName(item.delivery_zone_id),
      costOverride: this.formatCurrency(item.cost_override),
      freeShippingOverride: this.formatCurrency(item.free_shipping_min_amount_override),
      etaOverride: this.formatMethodZoneEta(item),
      status: {
        labelKey: item.is_active ? 'SHIPPING.STATUS.ACTIVE' : 'SHIPPING.STATUS.INACTIVE',
        className: this.statusClass(item.is_active),
      },
      raw: item,
    }))
  );

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'SHIPPING.KPI.ACTIVE_METHODS',
        titleKey: 'SHIPPING.KPI.ACTIVE_METHODS',
        value: stats.activeMethods.toString(),
        icon: 'pi pi-truck',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'SHIPPING.KPI.AVERAGE_SHIPPING_COST',
        titleKey: 'SHIPPING.KPI.AVERAGE_SHIPPING_COST',
        value: this.formatCurrency(stats.averageShippingCost),
        icon: 'pi pi-dollar',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'SHIPPING.KPI.ACTIVE_ZONES',
        titleKey: 'SHIPPING.KPI.ACTIVE_ZONES',
        value: stats.activeZones.toString(),
        icon: 'pi pi-map-marker',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'SHIPPING.KPI.DISABLED_METHODS',
        titleKey: 'SHIPPING.KPI.DISABLED_METHODS',
        value: stats.disabledMethods.toString(),
        icon: 'pi pi-ban',
        iconColor: '#dc3f35',
        iconBg: '#fff1f0',
        showChart: false,
      },
    ];
  });

  async ngOnInit(): Promise<void> {
    await this.loadShipping();
  }

  async loadShipping(): Promise<void> {
    this.loading.set(true);

    try {
      const [methods, zones, methodZones] = await Promise.all([
        this.shippingService.getShippingMethods(),
        this.shippingService.getDeliveryZones(),
        this.shippingService.getShippingMethodZones(),
      ]);

      this.methods.set(methods);
      this.zones.set(zones);
      this.methodZones.set(methodZones);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('SHIPPING.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('SHIPPING.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openMethodModal(method?: ShippingMethod): void {
    this.methodForm.set(method ? {
      id: method.id,
      name: method.name,
      code: method.code ?? '',
      carrier_name: method.carrier_name ?? '',
      description: method.description ?? '',
      icon: method.icon ?? 'pi pi-truck',
      base_cost: method.base_cost,
      free_shipping_min_amount: method.free_shipping_min_amount,
      eta_min_days: method.eta_min_days,
      eta_max_days: method.eta_max_days,
      eta_label: method.eta_label ?? '',
      is_active: method.is_active,
      sort_order: method.sort_order,
    } : { ...DEFAULT_METHOD_FORM });
    this.methodModalOpen.set(true);
  }

  openZoneModal(zone?: DeliveryZone): void {
    this.zoneForm.set(zone ? {
      id: zone.id,
      name: zone.name,
      country: zone.country ?? '',
      cities: zone.cities.join(', '),
      areas: zone.areas.join(', '),
      extra_cost: zone.extra_cost,
      is_active: zone.is_active,
    } : { ...DEFAULT_ZONE_FORM });
    this.zoneModalOpen.set(true);
  }

  openMethodZoneModal(item?: ShippingMethodZone): void {
    this.methodZoneForm.set(item ? {
      id: item.id,
      shipping_method_id: item.shipping_method_id,
      delivery_zone_id: item.delivery_zone_id,
      cost_override: item.cost_override,
      free_shipping_min_amount_override: item.free_shipping_min_amount_override,
      eta_min_days_override: item.eta_min_days_override,
      eta_max_days_override: item.eta_max_days_override,
      eta_label_override: item.eta_label_override ?? '',
      is_active: item.is_active,
    } : { ...DEFAULT_METHOD_ZONE_FORM });
    this.methodZoneModalOpen.set(true);
  }

  closeModals(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.methodModalOpen.set(false);
    this.zoneModalOpen.set(false);
    this.methodZoneModalOpen.set(false);
    this.deleteModalOpen.set(false);
    this.pendingDelete.set(null);
  }

  resetForms(): void {
    this.methodForm.set({ ...DEFAULT_METHOD_FORM });
    this.zoneForm.set({ ...DEFAULT_ZONE_FORM });
    this.methodZoneForm.set({ ...DEFAULT_METHOD_ZONE_FORM });
  }

  updateMethodForm<K extends keyof MethodForm>(key: K, value: MethodForm[K]): void {
    this.methodForm.update((form) => ({ ...form, [key]: value }));
  }

  updateMethodName(value: string): void {
    this.methodForm.update((form) => ({
      ...form,
      name: value,
      code: form.id || form.code.trim() ? form.code : this.createMethodCode(value),
    }));
  }

  updateZoneForm<K extends keyof ZoneForm>(key: K, value: ZoneForm[K]): void {
    this.zoneForm.update((form) => ({ ...form, [key]: value }));
  }

  updateMethodZoneForm<K extends keyof MethodZoneForm>(key: K, value: MethodZoneForm[K]): void {
    this.methodZoneForm.update((form) => ({ ...form, [key]: value }));
  }

  async saveMethod(): Promise<void> {
    const form = this.methodForm();

    const validationError = this.validateMethodForm(form);

    if (validationError) {
      this.toast.warn(this.translate.instant('SHIPPING.TOAST.VALIDATION_TITLE'), validationError);
      return;
    }

    await this.runMutation(async () => {
      const payload: ShippingMethodPayload = {
        name: form.name,
        code: form.code || null,
        carrier_name: form.carrier_name || null,
        description: form.description || null,
        icon: form.icon || null,
        base_cost: Number(form.base_cost ?? 0),
        free_shipping_min_amount: form.free_shipping_min_amount,
        eta_min_days: form.eta_min_days,
        eta_max_days: form.eta_max_days,
        eta_label: form.eta_label || null,
        is_active: form.is_active,
        sort_order: form.sort_order,
      };

      if (form.id) {
        await this.shippingService.updateShippingMethod(form.id, payload);
      } else {
        await this.shippingService.createShippingMethod(payload);
      }
    }, 'SHIPPING.TOAST.METHOD_SAVE_SUCCESS');
  }

  async saveZone(): Promise<void> {
    const form = this.zoneForm();

    if (!form.name.trim()) {
      this.toast.warn(
        this.translate.instant('SHIPPING.TOAST.VALIDATION_TITLE'),
        this.translate.instant('SHIPPING.ERRORS.ZONE_NAME_REQUIRED')
      );
      return;
    }

    await this.runMutation(async () => {
      const payload: DeliveryZonePayload = {
        name: form.name,
        country: form.country || null,
        cities: this.listFromText(form.cities),
        areas: this.listFromText(form.areas),
        extra_cost: Number(form.extra_cost ?? 0),
        is_active: form.is_active,
      };

      if (form.id) {
        await this.shippingService.updateDeliveryZone(form.id, payload);
      } else {
        await this.shippingService.createDeliveryZone(payload);
      }
    }, 'SHIPPING.TOAST.ZONE_SAVE_SUCCESS');
  }

  async saveMethodZone(): Promise<void> {
    const form = this.methodZoneForm();

    if (!form.shipping_method_id || !form.delivery_zone_id) {
      this.toast.warn(
        this.translate.instant('SHIPPING.TOAST.VALIDATION_TITLE'),
        this.translate.instant('SHIPPING.ERRORS.METHOD_ZONE_REQUIRED')
      );
      return;
    }

    const shippingMethodId = form.shipping_method_id;
    const deliveryZoneId = form.delivery_zone_id;

    await this.runMutation(async () => {
      const payload: ShippingMethodZonePayload = {
        shipping_method_id: shippingMethodId,
        delivery_zone_id: deliveryZoneId,
        cost_override: form.cost_override,
        free_shipping_min_amount_override: form.free_shipping_min_amount_override,
        eta_min_days_override: form.eta_min_days_override,
        eta_max_days_override: form.eta_max_days_override,
        eta_label_override: form.eta_label_override || null,
        is_active: form.is_active,
      };

      if (form.id) {
        await this.shippingService.updateShippingMethodZone(form.id, payload);
      } else {
        await this.shippingService.createShippingMethodZone(payload);
      }
    }, 'SHIPPING.TOAST.METHOD_ZONE_SAVE_SUCCESS');
  }

  async toggleMethod(method: ShippingMethod): Promise<void> {
    if (this.togglingMethodIds().has(method.id)) {
      return;
    }

    const previousValue = method.is_active;
    const nextValue = !previousValue;

    this.togglingMethodIds.update((ids) => {
      const next = new Set(ids);
      next.add(method.id);
      return next;
    });

    this.methods.update((methods) =>
      methods.map((item) =>
        item.id === method.id ? { ...item, is_active: nextValue } : item
      )
    );

    try {
      const updated = await this.shippingService.updateShippingMethod(method.id, {
        is_active: nextValue,
      });

      this.methods.update((methods) =>
        methods.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        )
      );

      await this.refreshShippingBadges();
      this.toast.success(this.translate.instant('SHIPPING.TOAST.STATUS_UPDATED'));
    } catch (error) {
      this.methods.update((methods) =>
        methods.map((item) =>
          item.id === method.id ? { ...item, is_active: previousValue } : item
        )
      );

      this.toast.failed(
        this.translate.instant('SHIPPING.TOAST.STATUS_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('SHIPPING.TOAST.STATUS_FAILED_DETAIL'))
      );
    } finally {
      this.togglingMethodIds.update((ids) => {
        const next = new Set(ids);
        next.delete(method.id);
        return next;
      });
    }
  }

  async toggleZone(zone: DeliveryZone): Promise<void> {
    await this.runMutation(
      () => this.shippingService.toggleDeliveryZone(zone),
      'SHIPPING.TOAST.ZONE_STATUS_UPDATED',
      'SHIPPING.TOAST.STATUS_FAILED_TITLE',
      'SHIPPING.TOAST.STATUS_FAILED_DETAIL'
    );
  }

  async toggleMethodZone(item: ShippingMethodZone): Promise<void> {
    await this.runMutation(
      () => this.shippingService.toggleShippingMethodZone(item),
      'SHIPPING.TOAST.METHOD_ZONE_STATUS_UPDATED',
      'SHIPPING.TOAST.STATUS_FAILED_TITLE',
      'SHIPPING.TOAST.STATUS_FAILED_DETAIL'
    );
  }

  openDelete(type: DeleteTarget, id: string, label: string): void {
    this.pendingDelete.set({ type, id, label });
    this.deleteModalOpen.set(true);
  }

  async confirmDelete(): Promise<void> {
    const target = this.pendingDelete();

    if (!target) {
      return;
    }

    await this.runMutation(async () => {
      switch (target.type) {
        case 'method':
          await this.shippingService.deleteShippingMethod(target.id);
          break;
        case 'zone':
          await this.shippingService.deleteDeliveryZone(target.id);
          break;
        case 'methodZone':
          await this.shippingService.deleteShippingMethodZone(target.id);
          break;
      }
    }, 'SHIPPING.TOAST.DELETE_SUCCESS', 'SHIPPING.TOAST.DELETE_FAILED_TITLE', 'SHIPPING.TOAST.DELETE_FAILED_DETAIL');
  }

  methodName(id: string): string {
    return this.methods().find((method) => method.id === id)?.name ?? this.translate.instant('SHIPPING.UNKNOWN_METHOD');
  }

  zoneName(id: string): string {
    return this.zones().find((zone) => zone.id === id)?.name ?? this.translate.instant('SHIPPING.UNKNOWN_ZONE');
  }

  formatCurrency(value: number | null | undefined): string {
    return this.formatMoney(value);
  }

  formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '-';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }

  formatEta(method: ShippingMethod): string {
    if (method.eta_label) {
      return method.eta_label;
    }

    if (method.eta_min_days === 0 && method.eta_max_days === 0) {
      return this.translate.instant('SHIPPING.ETA.SAME_DAY');
    }

    if (method.eta_min_days !== null && method.eta_max_days !== null) {
      return this.translate.instant('SHIPPING.ETA.RANGE_DAYS', {
        min: method.eta_min_days,
        max: method.eta_max_days,
      });
    }

    if (method.eta_min_days !== null) {
      return this.translate.instant('SHIPPING.ETA.MIN_PLUS_DAYS', { min: method.eta_min_days });
    }

    return '-';
  }

  formatMethodZoneEta(item: ShippingMethodZone): string {
    if (item.eta_label_override) {
      return item.eta_label_override;
    }

    if (item.eta_min_days_override === 0 && item.eta_max_days_override === 0) {
      return this.translate.instant('SHIPPING.ETA.SAME_DAY');
    }

    if (item.eta_min_days_override !== null && item.eta_max_days_override !== null) {
      return this.translate.instant('SHIPPING.ETA.RANGE_DAYS', {
        min: item.eta_min_days_override,
        max: item.eta_max_days_override,
      });
    }

    return item.shipping_method ? this.formatEta(item.shipping_method) : '-';
  }

  getMethodZones(methodId: string): DeliveryZone[] {
    return this.methodZones()
      .filter((item) => item.shipping_method_id === methodId && item.is_active)
      .map((item) => item.delivery_zone ?? this.zones().find((zone) => zone.id === item.delivery_zone_id) ?? null)
      .filter((zone): zone is DeliveryZone => !!zone);
  }

  getVisibleMethodZones(methodId: string): DeliveryZone[] {
    return this.getMethodZones(methodId).slice(0, 3);
  }

  getRemainingZonesCount(methodId: string): number {
    return Math.max(0, this.getMethodZones(methodId).length - 3);
  }

  zoneRegions(zone: DeliveryZone): string[] {
    return [...(zone.cities ?? []), ...(zone.areas ?? [])]
      .map((item) => item?.trim())
      .filter(Boolean);
  }

  visibleZoneRegions(zone: DeliveryZone): string[] {
    return this.zoneRegions(zone).slice(0, 3);
  }

  remainingZoneRegionsCount(zone: DeliveryZone): number {
    return Math.max(this.zoneRegions(zone).length - 3, 0);
  }

  deliveryZoneFromRow(row: AdminTableRow): DeliveryZone {
    return row.raw as DeliveryZone;
  }

  methodZoneFromRow(row: AdminTableRow): ShippingMethodZone {
    return row.raw as ShippingMethodZone;
  }

  methodModalTitle(): string {
    return this.methodForm().id ? 'SHIPPING.MODAL.EDIT_METHOD_TITLE' : 'SHIPPING.MODAL.CREATE_METHOD_TITLE';
  }

  methodModalSubtitle(): string {
    return this.methodForm().id ? this.methodForm().code || 'SHIPPING.MODAL.EXISTING_METHOD' : 'SHIPPING.MODAL.NEW_METHOD';
  }

  statusClass(isActive: boolean): string {
    return isActive ? 'bg-[#e9f8ef] text-[#117047]' : 'bg-[#fff1f0] text-[#b42318]';
  }

  textValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  numberValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return Number(value);
  }

  booleanValue(value: unknown): boolean {
    return value === true;
  }

  private async runMutation(
    action: () => Promise<void>,
    successMessageKey: string,
    failureTitleKey = 'SHIPPING.TOAST.SAVE_FAILED_TITLE',
    failureDetailKey = 'SHIPPING.TOAST.SAVE_FAILED_DETAIL'
  ): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await action();
      await this.loadShipping();
      await this.refreshShippingBadges();
      this.closeModals(true);
      this.resetForms();
      this.toast.success(this.translate.instant(successMessageKey));
    } catch (error) {
      this.toast.failed(
        this.translate.instant(failureTitleKey),
        this.errorDetail(error, this.translate.instant(failureDetailKey))
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async refreshShippingBadges(): Promise<void> {
    await Promise.all([
      this.sidebarBadges.refreshBadge('shipping.activeMethods'),
      this.sidebarBadges.refreshBadge('shipping.disabledMethods'),
      this.sidebarBadges.refreshBadge('shipping.activeZones'),
    ]);
  }

  private listFromText(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private createMethodCode(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private validateMethodForm(form: MethodForm): string | null {
    if (!form.name.trim()) {
      return this.translate.instant('SHIPPING.ERRORS.METHOD_NAME_REQUIRED');
    }

    if (!form.code.trim()) {
      return this.translate.instant('SHIPPING.ERRORS.METHOD_CODE_REQUIRED');
    }

    if (Number(form.base_cost ?? 0) < 0) {
      return this.translate.instant('SHIPPING.ERRORS.INVALID_PRICE');
    }

    if (form.free_shipping_min_amount !== null && form.free_shipping_min_amount < 0) {
      return this.translate.instant('SHIPPING.ERRORS.INVALID_FREE_OVER');
    }

    if (form.eta_min_days !== null && form.eta_min_days < 0) {
      return this.translate.instant('SHIPPING.ERRORS.INVALID_ETA_MIN');
    }

    if (form.eta_max_days !== null && form.eta_max_days < 0) {
      return this.translate.instant('SHIPPING.ERRORS.INVALID_ETA_MAX');
    }

    if (
      form.eta_min_days !== null &&
      form.eta_max_days !== null &&
      form.eta_max_days < form.eta_min_days
    ) {
      return this.translate.instant('SHIPPING.ERRORS.INVALID_ETA_RANGE');
    }

    return null;
  }
}
