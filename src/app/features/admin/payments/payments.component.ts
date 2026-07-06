import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../core/services';
import {
  PaymentMethod,
  PaymentMethodPayload,
  PaymentMethodType,
  PaymentTransaction,
  PaymentTransactionStatus,
  PaymentsService,
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
import { ExportReportComponent, ExportReportConfig } from '../../../shared/ui/export-report';

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

type PaymentsTab = 'transactions' | 'methods';
type PaymentMethodTableRow = AdminTableRow & { raw: PaymentMethod };
type PaymentTransactionTableRow = AdminTableRow & { raw: PaymentTransaction };
type TransactionStatusFilter = 'all' | PaymentTransactionStatus;
type TransactionMethodFilter = 'all' | string;

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
    ExportReportComponent,
    TranslatePipe,
  ],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.css',
})
export class PaymentsComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly activeTab = signal<PaymentsTab>('transactions');
  readonly methods = signal<PaymentMethod[]>([]);
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly statusFilter = signal<TransactionStatusFilter>('all');
  readonly methodFilter = signal<TransactionMethodFilter>('all');
  readonly methodModalOpen = signal(false);
  readonly deleteModalOpen = signal(false);
  readonly methodForm = signal<PaymentMethodForm>({ ...DEFAULT_PAYMENT_METHOD_FORM });
  readonly pendingDelete = signal<PaymentMethod | null>(null);

  readonly tabs: SelectOption<PaymentsTab>[] = [
    { label: 'PAYMENTS.TABS.TRANSACTIONS', value: 'transactions' },
    { label: 'PAYMENTS.TABS.METHODS', value: 'methods' },
  ];

  readonly transactionStatusOptions: SelectOption<TransactionStatusFilter>[] = [
    { label: 'PAYMENTS.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'PAYMENTS.STATUS.PAID', value: 'paid' },
    { label: 'PAYMENTS.STATUS.PENDING', value: 'pending' },
    { label: 'PAYMENTS.STATUS.FAILED', value: 'failed' },
    { label: 'PAYMENTS.STATUS.REFUNDED', value: 'refunded' },
    { label: 'PAYMENTS.STATUS.CANCELLED', value: 'cancelled' },
  ];

  readonly paymentTypeOptions: SelectOption<PaymentMethodType>[] = [
    { label: 'PAYMENTS.TYPE.MANUAL', value: 'manual' },
    { label: 'PAYMENTS.TYPE.ONLINE', value: 'online' },
    { label: 'PAYMENTS.TYPE.BANK_TRANSFER', value: 'bank_transfer' },
    { label: 'PAYMENTS.TYPE.WALLET', value: 'wallet' },
  ];

  readonly transactionColumns: AdminTableColumn[] = [
    { key: 'transaction', label: 'PAYMENTS.TABLE.TRANSACTION', type: 'text' },
    { key: 'customer', label: 'PAYMENTS.TABLE.CUSTOMER', type: 'text' },
    { key: 'amount', label: 'PAYMENTS.TABLE.AMOUNT', type: 'text' },
    { key: 'method', label: 'PAYMENTS.TABLE.METHOD', type: 'text' },
    { key: 'status', label: 'PAYMENTS.TABLE.STATUS', type: 'status' },
    { key: 'date', label: 'PAYMENTS.TABLE.DATE', type: 'text' },
    { key: 'notes', label: 'PAYMENTS.TABLE.NOTES', type: 'text' },
    { key: 'paid_at', label: 'PAYMENTS.TABLE.PAID_AT', type: 'text' },
    { key: 'refunded_at', label: 'PAYMENTS.TABLE.REFUNDED_AT', type: 'text' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  readonly paymentMethodColumns: AdminTableColumn[] = [
    { key: 'method', label: 'PAYMENTS.TABLE.METHOD', type: 'text' },
    { key: 'provider', label: 'PAYMENTS.TABLE.PROVIDER', type: 'text' },
    { key: 'type', label: 'PAYMENTS.TABLE.TYPE', type: 'badge' },
    { key: 'fees', label: 'PAYMENTS.TABLE.FEES', type: 'text' },
    { key: 'limits', label: 'PAYMENTS.TABLE.LIMITS', type: 'text' },
    { key: 'status', label: 'PAYMENTS.TABLE.STATUS', type: 'status' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  readonly methodFilterOptions = computed<SelectOption<TransactionMethodFilter>[]>(() => [
    { label: 'PAYMENTS.FILTERS.ALL_METHODS', value: 'all' },
    ...Array.from(new Set(this.transactions().map((transaction) => transaction.method_code).filter(Boolean))).map(
      (code) => ({
        label: this.methodNameForCode(code),
        value: code,
      })
    ),
  ]);

  readonly filteredTransactions = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();
    const method = this.methodFilter();

    return this.transactions().filter((transaction) => {
      const matchesSearch = query
        ? [
          transaction.transaction_code,
          transaction.order_number,
          transaction.customer_name,
          transaction.customer_email,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
        : true;
      const matchesStatus = status === 'all' || transaction.status === status;
      const matchesMethod = method === 'all' || transaction.method_code === method;

      return matchesSearch && matchesStatus && matchesMethod;
    });
  });

  readonly transactionStats = computed(() => this.paymentsService.getPaymentStats(this.transactions()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.transactionStats();

    return [
      {
        title: 'PAYMENTS.KPI.TOTAL_REVENUE',
        titleKey: 'PAYMENTS.KPI.TOTAL_REVENUE',
        value: this.formatMoney(stats.totalRevenue),
        icon: 'pi pi-chart-line',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.GATEWAY_FEES',
        titleKey: 'PAYMENTS.KPI.GATEWAY_FEES',
        value: this.formatMoney(stats.gatewayFees),
        icon: 'pi pi-credit-card',
        iconColor: '#675f55',
        iconBg: '#f1eee9',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.FAILED_PAYMENTS',
        titleKey: 'PAYMENTS.KPI.FAILED_PAYMENTS',
        value: stats.failedPayments.toString(),
        icon: 'pi pi-exclamation-triangle',
        iconColor: '#dc3f35',
        iconBg: '#fff1f0',
        showChart: false,
      },
      {
        title: 'PAYMENTS.KPI.REFUNDED_TOTAL',
        titleKey: 'PAYMENTS.KPI.REFUNDED_TOTAL',
        value: this.formatMoney(stats.refundedTotal),
        icon: 'pi pi-refresh',
        iconColor: '#3b78d8',
        iconBg: '#eaf2ff',
        showChart: false,
      },
    ];
  });

  readonly transactionRows = computed<PaymentTransactionTableRow[]>(() =>
    this.filteredTransactions().map((transaction) => ({
      id: transaction.id,
      transaction: transaction.transaction_code,
      customer: transaction.customer_name ?? '-',
      amount: this.formatMoney(transaction.amount, transaction.currency),
      method: transaction.method_name,
      status: {
        labelKey: this.transactionStatusLabelKey(transaction.status),
        className: this.transactionStatusClass(transaction.status),
      },
      date: this.formatDate(transaction.created_at),
      notes: transaction.notes || '-',
      paid_at: transaction.paid_at ? this.formatDate(transaction.paid_at) : '-',
      refunded_at: transaction.refunded_at ? this.formatDate(transaction.refunded_at) : '-',
      raw: transaction,
    }))
  );

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

  readonly paymentsExportConfig = computed<ExportReportConfig>(() => {
    const transactions = this.filteredTransactions();

    const totalAmount = transactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount ?? 0),
      0
    );

    const totalFees = transactions.reduce(
      (sum, transaction) => sum + Number(transaction.fee_amount ?? 0),
      0
    );

    const refundedTotal = transactions
      .filter((transaction) => transaction.status === 'refunded')
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

    return {
      fileName: 'nestora-payment-transactions-report',
      reportTitle: 'Nestora Home - Payment Transactions Report',
      reportSubtitle: `${transactions.length} transactions exported`,
      orientation: 'landscape',
      summaryItems: [
        { label: 'Transactions', value: transactions.length },
        { label: 'Paid', value: transactions.filter((transaction) => transaction.status === 'paid').length },
        { label: 'Pending', value: transactions.filter((transaction) => transaction.status === 'pending').length },
        { label: 'Failed', value: transactions.filter((transaction) => transaction.status === 'failed').length },
        { label: 'Refunded', value: transactions.filter((transaction) => transaction.status === 'refunded').length },
        { label: 'Amount', value: this.formatMoney(totalAmount) },
        { label: 'Fees', value: this.formatMoney(totalFees) },
        { label: 'Refunded Amt', value: this.formatMoney(refundedTotal) },
      ],
      sections: [
        {
          title: 'Payment Transactions',
          headers: [
            'Transaction Code',
            'Order Number',
            'Customer',
            'Customer Email',
            'Amount',
            'Fee',
            'Currency',
            'Method',
            'Status',
            'Reference',
            'Provider Transaction ID',
            'Created At',
            'Paid At',
            'Refunded At',
            'Notes',
          ],
          excludedPdfColumns: [
            'Customer Email',
            'Fee',
            'Currency',
            'Reference',
            'Provider Transaction ID',
            'Paid At',
            'Refunded At',
            'Notes',
          ],
          truncateColumns: [
            'Transaction Code',
            'Order Number',
            'Customer',
            'Method',
          ],
          columnWidths: {
            'Transaction Code': 34,
            'Order Number': 28,
            Customer: 34,
            Amount: 24,
            Method: 34,
            Status: 22,
            'Created At': 30,
          },
          rows: transactions.map((transaction) => [
            transaction.transaction_code || '-',
            transaction.order_number || '-',
            transaction.customer_name || '-',
            transaction.customer_email || '-',
            this.formatMoney(transaction.amount, transaction.currency),
            this.formatMoney(transaction.fee_amount, transaction.currency),
            transaction.currency || 'USD',
            transaction.method_name || transaction.method_code || '-',
            this.transactionStatusLabelKey(transaction.status).replace('PAYMENTS.STATUS.', ''),
            transaction.reference || '-',
            transaction.provider_transaction_id || '-',
            this.formatDate(transaction.created_at),
            transaction.paid_at ? this.formatDate(transaction.paid_at) : '-',
            transaction.refunded_at ? this.formatDate(transaction.refunded_at) : '-',
            transaction.notes || '-',
          ]),
        },
      ],
    };
  });

  async ngOnInit(): Promise<void> {
    await this.loadPaymentData();
  }

  async loadPaymentData(): Promise<void> {
    this.loading.set(true);

    try {
      const [methods, transactions] = await Promise.all([
        this.paymentsService.getPaymentMethods(),
        this.paymentsService.getPaymentTransactions(),
      ]);
      this.methods.set(methods);
      this.transactions.set(transactions);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PAYMENTS.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PAYMENTS.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loadPaymentMethods(): Promise<void> {
    const methods = await this.paymentsService.getPaymentMethods();
    this.methods.set(methods);
  }

  setActiveTab(tab: PaymentsTab): void {
    this.activeTab.set(tab);
  }

  updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  updateStatusFilter(value: TransactionStatusFilter): void {
    this.statusFilter.set(value);
  }

  updateMethodFilter(value: TransactionMethodFilter): void {
    this.methodFilter.set(value);
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

    await this.runMethodMutation(async () => {
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

    await this.runMethodMutation(
      () => this.paymentsService.deletePaymentMethod(method.id),
      'PAYMENTS.TOAST.DELETE_SUCCESS',
      'PAYMENTS.TOAST.DELETE_FAILED_TITLE',
      'PAYMENTS.TOAST.DELETE_FAILED_DETAIL'
    );
  }

  async toggleMethod(method: PaymentMethod): Promise<void> {
    await this.runMethodMutation(
      () => this.paymentsService.togglePaymentMethod(method),
      'PAYMENTS.TOAST.STATUS_UPDATED',
      'PAYMENTS.TOAST.STATUS_FAILED_TITLE',
      'PAYMENTS.TOAST.STATUS_FAILED_DETAIL'
    );
  }

  async refundTransaction(transaction: PaymentTransaction): Promise<void> {
    await this.runTransactionMutation(
      () => this.paymentsService.refundTransaction(transaction.id),
      'PAYMENTS.TOAST.REFUND_SUCCESS'
    );
  }

  async retryTransaction(transaction: PaymentTransaction): Promise<void> {
    await this.runTransactionMutation(
      () => this.paymentsService.retryTransaction(transaction.id),
      'PAYMENTS.TOAST.RETRY_SUCCESS'
    );
  }

  async markCodAsPaid(transaction: PaymentTransaction): Promise<void> {
    await this.runTransactionMutation(
      () => this.paymentsService.markCodAsPaid(transaction.id),
      'PAYMENTS.TOAST.MARK_PAID_SUCCESS'
    );
  }

  paymentMethodFromRow(row: AdminTableRow): PaymentMethod {
    return row.raw as PaymentMethod;
  }

  transactionFromRow(row: AdminTableRow): PaymentTransaction {
    return row.raw as PaymentTransaction;
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

  transactionStatusLabelKey(status: PaymentTransactionStatus): string {
    return `PAYMENTS.STATUS.${status.toUpperCase()}`;
  }

  transactionStatusClass(status: PaymentTransactionStatus): string {
    switch (status) {
      case 'paid':
        return 'bg-[#e9f8ef] text-[#117047]';
      case 'pending':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'refunded':
        return 'bg-[#eaf2ff] text-[#2f6fd0]';
      case 'failed':
        return 'bg-[#fff1f0] text-[#b42318]';
      case 'cancelled':
      default:
        return 'bg-[#f1eee9] text-[#675f55]';
    }
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

  formatMoney(value: number | null | undefined, currency = 'USD'): string {
    if (value === null || value === undefined) {
      return '-';
    }

    return new Intl.NumberFormat(this.currentLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  }

  formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat(this.currentLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  canRefund(transaction: PaymentTransaction): boolean {
    return transaction.status === 'paid' && transaction.method_code !== 'cod';
  }

  canRetry(transaction: PaymentTransaction): boolean {
    return transaction.status === 'failed' && transaction.method_code !== 'cod';
  }

  canMarkCodPaid(transaction: PaymentTransaction): boolean {
    return transaction.status === 'pending' && transaction.method_code === 'cod';
  }

  methodIcon(transaction: PaymentTransaction): string {
    const method = this.methods().find((item) => item.code === transaction.method_code);

    return method?.icon || (transaction.method_code === 'cod' ? 'pi pi-wallet' : 'pi pi-credit-card');
  }

  methodNameForCode(code: string): string {
    return this.transactions().find((transaction) => transaction.method_code === code)?.method_name ?? code;
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

  private async runMethodMutation(
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

  private async runTransactionMutation(
    action: () => Promise<PaymentTransaction>,
    successKey: string
  ): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      const updated = await action();
      this.transactions.update((transactions) =>
        transactions.map((transaction) => transaction.id === updated.id ? updated : transaction)
      );
      this.toast.success(this.translate.instant(successKey));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('PAYMENTS.TOAST.TRANSACTION_ACTION_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('PAYMENTS.TOAST.TRANSACTION_ACTION_FAILED_DETAIL'))
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

  private currentLocale(): string {
    return this.translate.currentLang() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
