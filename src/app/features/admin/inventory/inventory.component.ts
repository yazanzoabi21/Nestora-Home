import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  InventoryChangeType,
  InventoryProduct,
  InventoryService,
  InventoryStatusFilter,
  LOW_STOCK_LIMIT,
  ProductStatus,
  StockUpdateFormModel,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminPaginationComponent } from '../../../shared/ui/admin-pagination';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

interface AdminSelectOption<T extends string | number | null = string> {
  label: string;
  value: T;
}

const DEFAULT_STOCK_FORM: StockUpdateFormModel = {
  newStock: null,
  changeType: 'restock',
  note: '',
};

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminPaginationComponent,
    CommonModule,
    FormsModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly lowStockLimit = LOW_STOCK_LIMIT;
  readonly products = signal<InventoryProduct[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly selectedCategory = signal('all');
  readonly selectedStatus = signal<InventoryStatusFilter>('all');
  readonly showAll = signal(true);
  readonly currentPage = signal(1);
  readonly pageSize = signal(8);
  readonly selectedProduct = signal<InventoryProduct | null>(null);
  readonly isStockModalOpen = signal(false);
  readonly stockForm = signal<StockUpdateFormModel>({ ...DEFAULT_STOCK_FORM });

  readonly categoryOptions = computed<AdminSelectOption[]>(() => {
    const categories = Array.from(
      new Set(this.products().map((product) => this.categoryLabel(product)).filter(Boolean))
    ).sort((first, second) => first.localeCompare(second));

    return [
      { label: 'INVENTORY.FILTERS.ALL_CATEGORIES', value: 'all' },
      ...categories.map((category) => ({ label: category, value: category })),
    ];
  });

  readonly statusOptions: AdminSelectOption<InventoryStatusFilter>[] = [
    { label: 'INVENTORY.FILTERS.ALL_STATUSES', value: 'all' },
    { label: 'INVENTORY.STATUS.IN_STOCK', value: 'in_stock' },
    { label: 'INVENTORY.STATUS.LOW_STOCK', value: 'low_stock' },
    { label: 'INVENTORY.STATUS.OUT_OF_STOCK', value: 'out_of_stock' },
  ];

  readonly changeTypeOptions: AdminSelectOption<InventoryChangeType>[] = [
    { label: 'INVENTORY.CHANGE_TYPES.RESTOCK', value: 'restock' },
    { label: 'INVENTORY.CHANGE_TYPES.ADJUSTMENT', value: 'adjustment' },
    { label: 'INVENTORY.CHANGE_TYPES.DAMAGE', value: 'damage' },
    { label: 'INVENTORY.CHANGE_TYPES.RETURN', value: 'return' },
    { label: 'INVENTORY.CHANGE_TYPES.CORRECTION', value: 'correction' },
  ];

  readonly stats = computed(() => this.inventoryService.getInventoryStats(this.products()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'In Stock',
        titleKey: 'INVENTORY.KPI.IN_STOCK',
        value: stats.inStock.toString(),
        icon: 'pi pi-box',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Low Stock',
        titleKey: 'INVENTORY.KPI.LOW_STOCK',
        value: stats.lowStock.toString(),
        icon: 'pi pi-chart-line',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Out of Stock',
        titleKey: 'INVENTORY.KPI.OUT_OF_STOCK',
        value: stats.outOfStock.toString(),
        icon: 'pi pi-exclamation-triangle',
        iconColor: '#dc3f35',
        iconBg: '#fff1f0',
        showChart: false,
      },
      {
        title: 'Inventory Value',
        titleKey: 'INVENTORY.KPI.INVENTORY_VALUE',
        value: this.formatCurrency(stats.inventoryValue, 0),
        icon: 'pi pi-dollar',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
    ];
  });

  readonly outOfStockProducts = computed(() =>
    this.products().filter((product) => this.productStatus(product) === 'out_of_stock')
  );

  readonly lowStockProducts = computed(() =>
    this.products().filter((product) => this.productStatus(product) === 'low_stock')
  );

  readonly filteredProducts = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedCategory = this.selectedCategory();
    const selectedStatus = this.selectedStatus();
    const baseProducts = this.showAll()
      ? this.products()
      : this.products().filter((product) => this.productStatus(product) !== 'in_stock');

    return baseProducts.filter((product) => {
      const category = this.categoryLabel(product);
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        (product.sku ?? '').toLowerCase().includes(searchTerm);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || this.productStatus(product) === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  });

  readonly visibleProducts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredProducts().slice(start, start + this.pageSize());
  });

  async ngOnInit(): Promise<void> {
    await this.loadInventory();
  }

  async loadInventory(): Promise<void> {
    this.loading.set(true);

    try {
      this.products.set(await this.inventoryService.getInventoryProducts());
      this.currentPage.set(1);
    } catch (error) {
      this.toast.failed(
        this.translate.instant('INVENTORY.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('INVENTORY.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  syncStock(): void {
    void this.loadInventory();
    this.toast.info(this.translate.instant('INVENTORY.TOAST.SYNC_STARTED'));
  }

  openStockModal(product: InventoryProduct, changeType: InventoryChangeType = 'adjustment'): void {
    this.selectedProduct.set(product);
    this.stockForm.set({
      newStock: product.stock ?? 0,
      changeType,
      note: '',
    });
    this.isStockModalOpen.set(true);
  }

  closeStockModal(): void {
    if (this.saving()) {
      return;
    }

    this.isStockModalOpen.set(false);
    this.selectedProduct.set(null);
    this.stockForm.set({ ...DEFAULT_STOCK_FORM });
  }

  updateStockForm<K extends keyof StockUpdateFormModel>(key: K, value: StockUpdateFormModel[K]): void {
    this.stockForm.update((form) => ({
      ...form,
      [key]: value,
    }));
  }

  async saveStockUpdate(): Promise<void> {
    const product = this.selectedProduct();
    const form = this.stockForm();

    if (!product || form.newStock === null || form.newStock === undefined || Number(form.newStock) < 0) {
      this.toast.warn(
        this.translate.instant('INVENTORY.TOAST.INVALID_STOCK_TITLE'),
        this.translate.instant('INVENTORY.TOAST.INVALID_STOCK_DETAIL')
      );
      return;
    }

    this.saving.set(true);

    try {
      await this.inventoryService.updateProductStock(
        product.id,
        product.stock ?? 0,
        Number(form.newStock),
        form.changeType,
        form.note.trim() || null
      );
      await this.loadInventory();
      this.closeStockModal();
      this.toast.success(this.translate.instant('INVENTORY.TOAST.STOCK_UPDATED'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('INVENTORY.TOAST.UPDATE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('INVENTORY.TOAST.UPDATE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('all');
    this.selectedStatus.set('all');
    this.showAll.set(true);
    this.currentPage.set(1);
  }

  toggleShowAll(): void {
    this.showAll.update((value) => !value);
    this.currentPage.set(1);
  }

  setPage(page: number): void {
    this.currentPage.set(page);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  productStatus(product: InventoryProduct): ProductStatus {
    return this.inventoryService.getProductStatus(product.stock);
  }

  categoryLabel(product: InventoryProduct): string {
    return product.categoryName || this.translate.instant('INVENTORY.UNCATEGORIZED');
  }

  statusLabelKey(product: InventoryProduct): string {
    return `INVENTORY.STATUS.${this.productStatus(product).toUpperCase()}`;
  }

  productValue(product: InventoryProduct): number {
    return (product.stock ?? 0) * this.unitPrice(product);
  }

  unitPrice(product: InventoryProduct): number {
    return this.inventoryService.unitPrice(product);
  }

  stockProgress(product: InventoryProduct): number {
    const stock = product.stock ?? 0;
    const sold = product.sold_count ?? 0;
    const total = stock + sold;

    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((stock / total) * 100));
  }

  productInitials(product: InventoryProduct): string {
    return product.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  formatCurrency(value: number, maximumFractionDigits = 2): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits,
    }).format(value);
  }

  stockClass(product: InventoryProduct): string {
    const status = this.productStatus(product);

    if (status === 'out_of_stock') {
      return 'text-[#dc3f35]';
    }

    if (status === 'low_stock') {
      return 'text-[#d98916]';
    }

    return 'text-[#2f9f69]';
  }

  statusClass(product: InventoryProduct): string {
    const status = this.productStatus(product);

    if (status === 'out_of_stock') {
      return 'bg-[#fff1f0] text-[#b42318]';
    }

    if (status === 'low_stock') {
      return 'bg-[#fff6e7] text-[#a66309]';
    }

    return 'bg-[#e9f8ef] text-[#117047]';
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
