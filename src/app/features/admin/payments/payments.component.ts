import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../core/services';
import { PaymentMethod, PaymentMethodPayload, PaymentMethodType, PaymentsService } from '../../../data-access';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import {
  AdminTableCellTemplateDirective,
  AdminTableColumn,
  AdminTableComponent,
  AdminTableRow,
} from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

interface SelectOption<T extends string = string> {
  label: string;
  value: T;
}

interface PaymentMethodForm {
  id: string | null;
  name: string;
  code: string;
  provider: string;
  type: PaymentMethodType;
  description: string;
  icon: string;
  instructions_en: string;
  instructions_ar: string;
  fee_fixed: number | null;
  fee_percentage: number | null;
  min_amount: number | null;
  max_amount: number | null;
  sort_order: number | null;
  is_active: boolean;
  config: string;
}

type PaymentMethodTableRow = AdminTableRow & {
  raw: PaymentMethod;
};

const DEFAULT_PAYMENT_METHOD_FORM: PaymentMethodForm = {
  id: null,
  name: '',
  code: '',
  provider: '',
  type: 'manual',
  description: '',
  icon: 'pi pi-wallet',
  instructions_en: '',
  instructions_ar: '',
  fee_fixed: 0,
  fee_percentage: 0,
  min_amount: null,
  max_amount: null,
  sort_order: 0,
  is_active: true,
  config: '{}',
};

@Component({
  selector: 'app-payments',
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
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.css',
})
export class PaymentsComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly methods = signal<PaymentMethod[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly methodModalOpen = signal(false);
  readonly deleteModalOpen = signal(false);
  readonly methodForm = signal<PaymentMethodForm>({ ...DEFAULT_PAYMENT_METHOD_FORM });
  readonly pendingDelete = signal<PaymentMethod | null>(null);

  readonly paymentTypeOptions: SelectOption<PaymentMethodType>[] = [
    { label: 'PAYMENTS.TYPE.MANUAL', value: 'manual' },
    { label: 'PAYMENTS.TYPE.ONLINE', value: 'online' },
    { label: 'PAYMENTS.TYPE.BANK_TRANSFER', value: 'bank_transfer' },
    { label: 'PAYMENTS.TYPE.WALLET', value: 'wallet' },
  ];

  readonly paymentMethodColumns: AdminTableColumn[] = [
    { key: 'method', label: 'PAYMENTS.TABLE.METHOD', type: 'text' },
    { key: 'provider', label: 'PAYMENTS.TABLE.PROVIDER', type: 'text' },
    { key: 'type', label: 'PAYMENTS.TABLE.TYPE', type: 'badge' },
    { key: 'fees', label: 'PAYMENTS.TABLE.FEES', type: 'text' },
    { key: 'limits', label: 'PAYMENTS.TABLE.LIMITS', type: 'text' },
    { key: 'status', label: 'PAYMENTS.TABLE.STATUS', type: 'status' },
    { key: 'actions', label: 'PAYMENTS.TABLE.ACTIONS', type: 'actions' },
  ];

  readonly stats = computed(() => this.paymentsService.getPaymentMethodStats(this.methods()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'PAYMENTS.KPI.ACTIVE_METHODS',
        titleKey: 'PAYMENTS.KPI.ACTIVE_METHODS',
        value: stats.activeMethods.toString(),
        icon: 'pi pi-check-circle',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.ONLINE_METHODS',
        titleKey: 'PAYMENTS.KPI.ONLINE_METHODS',
        value: stats.onlineMethods.toString(),
        icon: 'pi pi-globe',
        iconColor: '#3b78d8',
        iconBg: '#eaf2ff',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.MANUAL_METHODS',
        titleKey: 'PAYMENTS.KPI.MANUAL_METHODS',
        value: stats.manualMethods.toString(),
        icon: 'pi pi-wallet',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.DISABLED_METHODS',
        titleKey: 'PAYMENTS.KPI.DISABLED_METHODS',
        value: stats.disabledMethods.toString(),
        icon: 'pi pi-ban',
        iconColor: '#dc3f35',
        iconBg: '#fff1f0',
        showChart: false,
      },
    ];
  });

  readonly paymentMethodRows = computed<PaymentMethodTableRow[]>(() =>
    this.methods().map((method) => ({
      id: method.id,
      method: method.name,
      provider: method.provider || '-',
      type: {
        labelKey: this.typeLabelKey(method.type),
        className: this.typeBadgeClass(method.type),
      },
      fees: this.feesLabel(method),
      limits: this.limitsLabel(method),
      status: {
        labelKey: method.is_active ? 'PAYMENTS.STATUS.ACTIVE' : 'PAYMENTS.STATUS.INACTIVE',
        className: this.statusClass(method.is_active),
      },
      raw: method,
    }))
  );

  async ngOnInit(): Promise<void> {
    await this.loadPaymentMethods();
  }

  async loadPaymentMethods(): Promise<void> {
    this.loading.set(true);

    try {
      this.methods.set(await this.paymentsService.getPaymentMethods());
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PAYMENTS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PAYMENTS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openMethodModal(method?: PaymentMethod): void {
    this.methodForm.set(method ? {
      id: method.id,
      name: method.name,
      code: method.code,
      provider: method.provider ?? '',
      type: method.type,
      description: method.description ?? '',
      icon: method.icon ?? 'pi pi-wallet',
      instructions_en: method.instructions_en ?? '',
      instructions_ar: method.instructions_ar ?? '',
      fee_fixed: method.fee_fixed,
      fee_percentage: method.fee_percentage,
      min_amount: method.min_amount,
      max_amount: method.max_amount,
      sort_order: method.sort_order,
      is_active: method.is_active,
      config: JSON.stringify(method.config ?? {}, null, 2),
    } : { ...DEFAULT_PAYMENT_METHOD_FORM });
    this.methodModalOpen.set(true);
  }

  closeModals(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.methodModalOpen.set(false);
    this.deleteModalOpen.set(false);
    this.pendingDelete.set(null);
  }

  updateMethodForm<K extends keyof PaymentMethodForm>(key: K, value: PaymentMethodForm[K]): void {
    this.methodForm.update((form) => ({ ...form, [key]: value }));
  }

  updateMethodName(value: string): void {
    this.methodForm.update((form) => ({
      ...form,
      name: value,
      code: form.id || form.code.trim() ? form.code : this.createCode(value),
    }));
  }

  async saveMethod(): Promise<void> {
    const form = this.methodForm();
    const validationError = this.validateMethodForm(form);

    if (validationError) {
      this.toast.warn(this.translate.instant('PAYMENTS.TOAST.VALIDATION_TITLE'), validationError);
      return;
    }

    await this.runMutation(async () => {
      const payload = this.buildPayload(form);

      if (form.id) {
        await this.paymentsService.updatePaymentMethod(form.id, payload);
      } else {
        await this.paymentsService.createPaymentMethod(payload);
      }
    }, 'PAYMENTS.TOAST.SAVE_SUCCESS');
  }

  openDelete(method: PaymentMethod): void {
    this.pendingDelete.set(method);
    this.deleteModalOpen.set(true);
  }

  async confirmDelete(): Promise<void> {
    const method = this.pendingDelete();

    if (!method) {
      return;
    }

    await this.runMutation(
      () => this.paymentsService.deletePaymentMethod(method.id),
      'PAYMENTS.TOAST.DELETE_SUCCESS',
      'PAYMENTS.TOAST.DELETE_FAILED_TITLE',
      'PAYMENTS.TOAST.DELETE_FAILED_DETAIL'
    );
  }

  async toggleMethod(method: PaymentMethod): Promise<void> {
    await this.runMutation(
      () => this.paymentsService.togglePaymentMethod(method),
      'PAYMENTS.TOAST.STATUS_UPDATED',
      'PAYMENTS.TOAST.STATUS_FAILED_TITLE',
      'PAYMENTS.TOAST.STATUS_FAILED_DETAIL'
    );
  }

  paymentMethodFromRow(row: AdminTableRow): PaymentMethod {
    return row.raw as PaymentMethod;
  }

  modalTitle(): string {
    return this.methodForm().id ? 'PAYMENTS.MODAL.EDIT_TITLE' : 'PAYMENTS.MODAL.CREATE_TITLE';
  }

  modalSubtitle(): string {
    return this.methodForm().id ? 'PAYMENTS.MODAL.EDIT_SUBTITLE' : 'PAYMENTS.MODAL.CREATE_SUBTITLE';
  }

  typeLabelKey(type: PaymentMethodType): string {
    return `PAYMENTS.TYPE.${type.toUpperCase()}`;
  }

  typeBadgeClass(type: PaymentMethodType): string {
    if (type === 'online' || type === 'wallet') {
      return 'bg-[#eaf2ff] text-[#2f6fd0]';
    }

    return 'bg-[#fff6e7] text-[#a66309]';
  }

  statusClass(isActive: boolean): string {
    return isActive ? 'bg-[#e9f8ef] text-[#117047]' : 'bg-[#fff1f0] text-[#b42318]';
  }

  feesLabel(method: PaymentMethod): string {
    const labels: string[] = [];

    if (method.fee_fixed > 0) {
      labels.push(this.formatMoney(method.fee_fixed));
    }

    if (method.fee_percentage > 0) {
      labels.push(`${method.fee_percentage}%`);
    }

    return labels.length ? labels.join(' + ') : this.translate.instant('PAYMENTS.NO_FEES');
  }

  limitsLabel(method: PaymentMethod): string {
    if (method.min_amount !== null && method.max_amount !== null) {
      return `${this.formatMoney(method.min_amount)} - ${this.formatMoney(method.max_amount)}`;
    }

    if (method.min_amount !== null) {
      return this.translate.instant('PAYMENTS.MIN_LIMIT', { amount: this.formatMoney(method.min_amount) });
    }

    if (method.max_amount !== null) {
      return this.translate.instant('PAYMENTS.MAX_LIMIT', { amount: this.formatMoney(method.max_amount) });
    }

    return this.translate.instant('PAYMENTS.NO_LIMITS');
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
    action: () => Promise<unknown>,
    successKey: string,
    failureTitleKey = 'PAYMENTS.TOAST.SAVE_FAILED_TITLE',
    failureDetailKey = 'PAYMENTS.TOAST.SAVE_FAILED_DETAIL'
  ): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await action();
      await this.loadPaymentMethods();
      this.closeModals(true);
      this.methodForm.set({ ...DEFAULT_PAYMENT_METHOD_FORM });
      this.toast.success(this.translate.instant(successKey));
    } catch (error) {
      this.toast.failed(
        this.translate.instant(failureTitleKey),
        this.errorDetail(error, this.translate.instant(failureDetailKey))
      );
    } finally {
      this.saving.set(false);
    }
  }

  private buildPayload(form: PaymentMethodForm): PaymentMethodPayload {
    return {
      code: form.code.trim().toLowerCase(),
      name: form.name.trim(),
      provider: form.provider.trim() || null,
      type: form.type,
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
      instructions_en: form.instructions_en.trim() || null,
      instructions_ar: form.instructions_ar.trim() || null,
      fee_fixed: Number(form.fee_fixed ?? 0),
      fee_percentage: Number(form.fee_percentage ?? 0),
      min_amount: form.min_amount,
      max_amount: form.max_amount,
      sort_order: Number(form.sort_order ?? 0),
      is_active: form.is_active,
      config: this.parseConfig(form.config),
    };
  }

  private parseConfig(value: string): Record<string, unknown> {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  }

  private validateMethodForm(form: PaymentMethodForm): string | null {
    if (!form.name.trim()) {
      return this.translate.instant('PAYMENTS.ERRORS.NAME_REQUIRED');
    }

    if (!form.code.trim()) {
      return this.translate.instant('PAYMENTS.ERRORS.CODE_REQUIRED');
    }

    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(form.code.trim())) {
      return this.translate.instant('PAYMENTS.ERRORS.CODE_INVALID');
    }

    if (!form.type) {
      return this.translate.instant('PAYMENTS.ERRORS.TYPE_REQUIRED');
    }

    if (Number(form.fee_fixed ?? 0) < 0 || Number(form.fee_percentage ?? 0) < 0) {
      return this.translate.instant('PAYMENTS.ERRORS.FEES_INVALID');
    }

    if (form.min_amount !== null && form.min_amount < 0) {
      return this.translate.instant('PAYMENTS.ERRORS.MIN_AMOUNT_INVALID');
    }

    if (form.max_amount !== null && form.max_amount < 0) {
      return this.translate.instant('PAYMENTS.ERRORS.MAX_AMOUNT_INVALID');
    }

    if (form.min_amount !== null && form.max_amount !== null && form.max_amount < form.min_amount) {
      return this.translate.instant('PAYMENTS.ERRORS.MAX_LESS_THAN_MIN');
    }

    try {
      this.parseConfig(form.config);
    } catch {
      return this.translate.instant('PAYMENTS.ERRORS.CONFIG_INVALID');
    }

    return null;
  }

  private createCode(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
