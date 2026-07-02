import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import {
  CategoriesService,
  Category,
  MediaAsset,
  MediaFileType,
  MediaLibraryService,
  Product,
  ProductFormModel,
  ProductMutationPayload,
  ProductPriceRange,
  ProductStats,
  ProductStatus,
  ProductStatusFilter,
  ProductTableRowData,
  ProductsService,
  UploadService,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableColumn, AdminTableRow, AdminTableComponent } from '../../../shared/ui/admin-table';
import { ExportReportComponent, ExportReportConfig } from '../../../shared/ui/export-report';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';
import { MediaPickerModalComponent } from '../../../shared/ui/media-picker-modal';
type ViewMode = 'list' | 'grid';
type ProductModalMode = 'add' | 'edit';
type CategoryFilterValue = 'all' | 'uncategorized' | string;

type ProductTableRow = AdminTableRow & ProductTableRowData;
interface AdminSelectOption<T extends string | null = string> {
  label: string;
  value: T;
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const EMPTY_PRODUCT_FORM: ProductFormModel = {
  name: '',
  slug: '',
  sku: '',
  categoryId: null,
  mediaId: null,
  price: null,
  salePrice: null,
  stock: null,
  soldCount: null,
  rating: null,
  shortDescription: '',
  description: '',
  imageUrl: '',
  gallery: null,
  isFeatured: false,
  isNew: false,
  isActive: true,
};

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    AdminFormModalComponent,
    AdminFormFieldComponent,
    AdminTableComponent,
    CommonModule,
    ExportReportComponent,
    FormsModule,
    KpiCardComponent,
    MediaPickerModalComponent,
    TranslatePipe,
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.css',
})
export class ProductsComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly mediaLibraryService = inject(MediaLibraryService);
  private readonly uploadService = inject(UploadService);
  private readonly toast = inject(ToastService);

  readonly products = signal<Product[]>([]);
  readonly categoryRecords = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly selectedCategory = signal<CategoryFilterValue>('all');
  readonly selectedStatus = signal<ProductStatusFilter>('all');
  readonly selectedPriceRange = signal<ProductPriceRange>('all');
  readonly viewMode = signal<ViewMode>('list');
  readonly selectedProductIds = signal<Set<string>>(new Set());
  readonly selectedProductsCount = computed(() => this.selectedProductIds().size);
  readonly selectedProductsLabel = computed(() => {
    const count = this.selectedProductsCount();
    return `${count} product${count === 1 ? '' : 's'} selected`;
  });
  readonly isDeleteProductModalOpen = signal(false);
  readonly isDeleteSelectedProductsModalOpen = signal(false);
  readonly deleteSelectedProductsMessage = computed(() => {
    const count = this.selectedProductsCount();
    return `Are you sure you want to delete ${count} selected product${count === 1 ? '' : 's'}? This action cannot be undone.`;
  });
  readonly productPendingDelete = signal<Product | null>(null);
  readonly tableSelectionResetKey = signal(0);
  readonly isProductModalOpen = signal(false);
  readonly productModalMode = signal<ProductModalMode>('add');
  readonly selectedProduct = signal<Product | null>(null);
  readonly productForm = signal<ProductFormModel>({ ...EMPTY_PRODUCT_FORM });
  readonly selectedImageFile = signal<File | null>(null);
  readonly selectedProductMedia = signal<MediaAsset | null>(null);
  readonly isProductMediaPickerOpen = signal(false);
  readonly imagePreviewUrl = signal<string | null>(null);
  readonly productMediaFileTypes: MediaFileType[] = ['image', 'banner'];

  readonly productTableColumns: AdminTableColumn[] = [
    { key: 'product', label: 'PRODUCTS.TABLE.PRODUCT', type: 'imageText' },
    { key: 'slug', label: 'PRODUCTS.TABLE.SLUG', type: 'text' },
    { key: 'category', label: 'PRODUCTS.TABLE.CATEGORY', type: 'badge' },
    { key: 'price', label: 'PRODUCTS.TABLE.PRICE', type: 'price' },
    { key: 'salePrice', label: 'PRODUCTS.TABLE.SALE_PRICE', type: 'text' },
    { key: 'stock', label: 'PRODUCTS.TABLE.STOCK', type: 'stock' },
    { key: 'sold', label: 'PRODUCTS.TABLE.SOLD', type: 'number' },
    { key: 'rating', label: 'PRODUCTS.TABLE.RATING', type: 'text' },
    { key: 'featured', label: 'PRODUCTS.TABLE.FEATURED', type: 'badge' },
    { key: 'newProduct', label: 'PRODUCTS.TABLE.NEW', type: 'badge' },
    { key: 'active', label: 'PRODUCTS.TABLE.ACTIVE', type: 'badge' },
    { key: 'status', label: 'PRODUCTS.TABLE.STATUS', type: 'status' },
    { key: 'createdAt', label: 'PRODUCTS.TABLE.CREATED_AT', type: 'text' },
    { key: 'actions', label: '', type: 'actions' },
  ];

  readonly categoryFilterOptions = computed<AdminSelectOption[]>(() => [
    { label: 'PRODUCTS.ALL_CATEGORIES', value: 'all' },
    { label: 'Uncategorized', value: 'uncategorized' },
    ...this.categoryHierarchyOptions(),
  ]);
  readonly productCategoryOptions = computed<AdminSelectOption<string | null>[]>(() => [
    { label: 'Uncategorized', value: null },
    ...this.categoryHierarchyOptions(),
  ]);
  readonly categoryHierarchyOptions = computed<AdminSelectOption[]>(() =>
    this.categoryRecords()
      .map((category) => ({
        label: this.categoryHierarchyLabel(category),
        value: category.id,
      }))
      .sort((first, second) => first.label.localeCompare(second.label))
  );
  readonly statusFilterOptions: AdminSelectOption<ProductStatusFilter>[] = [
    { label: 'PRODUCTS.ALL_STATUSES', value: 'all' },
    { label: 'PRODUCTS.STATUS.IN_STOCK', value: 'in_stock' },
    { label: 'PRODUCTS.STATUS.LOW_STOCK', value: 'low_stock' },
    { label: 'PRODUCTS.STATUS.OUT_OF_STOCK', value: 'out_of_stock' },
  ];

  readonly filteredProducts = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedCategory = this.selectedCategory();
    const selectedStatus = this.selectedStatus();
    const selectedPriceRange = this.selectedPriceRange();

    return this.products().filter((product) => {
      const category = this.categoryLabel(product);
      const price = product.sale_price ?? product.price;
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        (product.sku ?? '').toLowerCase().includes(searchTerm) ||
        (product.slug ?? '').toLowerCase().includes(searchTerm) ||
        category.toLowerCase().includes(searchTerm);
      const matchesCategory = this.matchesCategoryFilter(product, selectedCategory);
      const matchesStatus = selectedStatus === 'all' || this.productStatus(product) === selectedStatus;
      const matchesPriceRange = this.matchesPriceRange(price, selectedPriceRange);

      return matchesSearch && matchesCategory && matchesStatus && matchesPriceRange;
    });
  });

  readonly stats = computed<ProductStats>(() =>
    this.products().reduce<ProductStats>(
      (stats, product) => {
        const status = this.productStatus(product);

        stats.total += 1;
        stats.inStock += status === 'in_stock' ? 1 : 0;
        stats.lowStock += status === 'low_stock' ? 1 : 0;
        stats.outOfStock += status === 'out_of_stock' ? 1 : 0;
        stats.featured += product.is_featured ? 1 : 0;
        stats.newProducts += product.is_new ? 1 : 0;
        stats.inactive += product.is_active === false ? 1 : 0;

        return stats;
      },
      {
        total: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        featured: 0,
        newProducts: 0,
        inactive: 0,
      }
    )
  );

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Total Products',
        titleKey: 'PRODUCTS.STATS.TOTAL_PRODUCTS',
        value: stats.total.toString(),
        icon: 'pi pi-box',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'In Stock',
        titleKey: 'PRODUCTS.STATS.IN_STOCK',
        value: stats.inStock.toString(),
        icon: 'pi pi-check-circle',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Low Stock',
        titleKey: 'PRODUCTS.STATS.LOW_STOCK',
        value: stats.lowStock.toString(),
        icon: 'pi pi-exclamation-circle',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Out of Stock',
        titleKey: 'PRODUCTS.STATS.OUT_OF_STOCK',
        value: stats.outOfStock.toString(),
        icon: 'pi pi-times-circle',
        iconColor: '#dc3f35',
        iconBg: '#fff1f0',
        showChart: false,
      },
    ];
  });

  readonly tableRows = computed<ProductTableRow[]>(() =>
    this.filteredProducts().map((product) => this.toTableRow(product))
  );

  readonly productsExportConfig = computed<ExportReportConfig>(() => {
    const products = this.filteredProducts();

    return {
      fileName: 'nestora-products-report',
      reportTitle: 'Nestora Home - Products Report',
      reportSubtitle: `${products.length} products exported`,
      orientation: 'landscape',
      summaryItems: [
        { label: 'Total Products', value: products.length },
        { label: 'In Stock', value: products.filter((product) => this.productStatus(product) === 'in_stock').length },
        { label: 'Low Stock', value: products.filter((product) => this.productStatus(product) === 'low_stock').length },
        { label: 'Out of Stock', value: products.filter((product) => this.productStatus(product) === 'out_of_stock').length },
      ],
      sections: [
        {
          title: 'Products',
          headers: [
            'Name',
            'SKU',
            'Category',
            'Price',
            'Sale Price',
            'Stock',
            'Sold',
            'Status',
            'Active',
            'Featured',
            'Created At',
            'Slug',
            'Rating',
            'New',
            'Short Description',
            'Description',
            'Image URL',
          ],
          excludedPdfColumns: [
            'Slug',
            'Rating',
            'New',
            'Short Description',
            'Description',
            'Image URL',
          ],
          truncateColumns: ['Name', 'Category'],
          columnWidths: {
            Name: 42,
            SKU: 25,
            Category: 38,
            Price: 22,
            'Sale Price': 22,
            Stock: 16,
            Sold: 16,
            Status: 26,
            Active: 18,
            Featured: 20,
            'Created At': 24,
          },
          rows: products.map((product) => [
            product.name,
            product.sku || '-',
            this.categoryLabel(product),
            this.formatCurrency(product.price),
            product.sale_price === null ? '-' : this.formatCurrency(product.sale_price),
            product.stock ?? 0,
            product.sold_count ?? 0,
            this.productStatus(product).replaceAll('_', ' '),
            this.yesNo(product.is_active),
            this.yesNo(product.is_featured),
            this.formatDate(product.created_at),
            product.slug || '-',
            product.rating ?? '-',
            this.yesNo(product.is_new),
            product.short_description || '-',
            product.description || '-',
            product.image_url || '-',
          ]),
        },
      ],
    };
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchTerm().trim().length > 0 ||
      this.selectedCategory() !== 'all' ||
      this.selectedStatus() !== 'all' ||
      this.selectedPriceRange() !== 'all'
  );

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadProducts(), this.loadCategories()]);
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);

    try {
      const products = await this.productsService.getProducts();
      this.products.set(products);
    } catch (error) {
      this.toast.failed('Loading products', this.errorDetail(error, 'Unable to load products.'));
    } finally {
      this.loading.set(false);
    }
  }

  async loadCategories(): Promise<void> {
    try {
      const categories = await this.categoriesService.getCategories();
      this.categoryRecords.set(categories);
    } catch (error) {
      this.toast.failed('Loading categories', this.errorDetail(error, 'Unable to load categories.'));
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('all');
    this.selectedStatus.set('all');
    this.selectedPriceRange.set('all');
  }

  updateSelection(rows: AdminTableRow[]): void {
    this.selectedProductIds.set(new Set(rows.map((row) => row.id)));
  }

  async deleteProduct(product: Product): Promise<void> {
    try {
      await this.productsService.deleteProduct(product.id);
      await this.loadProducts();
      this.toast.deleted('Product');
    } catch (error) {
      this.toast.failed('Deleting product', this.errorDetail(error, 'Unable to delete product.'));
    }
  }

  openAddProductModal(): void {
    this.productModalMode.set('add');
    this.selectedProduct.set(null);
    this.productForm.set({ ...EMPTY_PRODUCT_FORM });
    this.resetImageState();
    this.imageUploadError.set(null);
    this.isProductModalOpen.set(true);
  }

  openEditProductModal(value: Product | AdminTableRow): void {
    const product = this.resolveProductFromTableEvent(value);

    if (!product) {
      this.toast.failed('Opening product', 'Product data is missing.');
      return;
    }

    this.productModalMode.set('edit');
    this.selectedProduct.set(product);

    this.productForm.set({
      name: product.name,
      slug: product.slug ?? '',
      sku: product.sku ?? '',
      categoryId: product.category_id,
      mediaId: product.media_id ?? null,
      price: product.price,
      salePrice: product.sale_price,
      stock: product.stock,
      soldCount: product.sold_count,
      rating: product.rating,
      shortDescription: product.short_description ?? '',
      description: product.description ?? '',
      imageUrl: product.image_url ?? '',
      gallery: product.gallery,
      isFeatured: !!product.is_featured,
      isNew: !!product.is_new,
      isActive: product.is_active !== false,
    });

    this.selectedImageFile.set(null);
    this.selectedProductMedia.set(null);
    this.imagePreviewUrl.set(product.image_url);
    this.imageUploadError.set(null);
    this.isProductModalOpen.set(true);
  }

  closeProductModal(): void {
    this.isProductModalOpen.set(false);
    this.resetProductForm();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    const validationError = this.validateImageFile(file);

    if (validationError) {
      this.imageUploadError.set(validationError);
      this.selectedImageFile.set(null);
      this.imagePreviewUrl.set(this.productForm().imageUrl || null);
      input.value = '';
      return;
    }

    this.imageUploadError.set(null);
    this.selectedImageFile.set(file);
    this.selectedProductMedia.set(null);
    this.productForm.update((form) => ({ ...form, mediaId: null }));
    this.imagePreviewUrl.set(URL.createObjectURL(file));
  }

  removeSelectedImage(): void {
    this.selectedImageFile.set(null);
    this.selectedProductMedia.set(null);
    this.imagePreviewUrl.set(null);
    this.imageUploadError.set(null);
    this.productForm.update((form) => ({ ...form, mediaId: null, imageUrl: '' }));
  }

  openProductMediaPicker(): void {
    if (this.saving()) {
      return;
    }

    this.isProductMediaPickerOpen.set(true);
  }

  closeProductMediaPicker(): void {
    this.isProductMediaPickerOpen.set(false);
  }

  selectProductMedia(asset: MediaAsset): void {
    this.selectedImageFile.set(null);
    this.selectedProductMedia.set(asset);
    this.imagePreviewUrl.set(asset.file_url);
    this.imageUploadError.set(null);
    this.productForm.update((form) => ({
      ...form,
      mediaId: asset.id,
      imageUrl: asset.file_url,
    }));
    this.isProductMediaPickerOpen.set(false);
  }

  async saveProduct(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.imageUploadError.set(null);

    try {
      const selectedImageFile = this.selectedImageFile();
      let imageUrl = this.productForm().imageUrl || null;

      if (selectedImageFile) {
        try {
          imageUrl = await this.uploadService.uploadProductImage(selectedImageFile);
          this.productForm.update((form) => ({ ...form, mediaId: null }));
        } catch (error) {
          throw new Error('PRODUCTS.UPLOAD_FAILED', { cause: error });
        }
      }

      const payload = this.buildProductPayload(imageUrl);
      const selectedProduct = this.selectedProduct();
      const isEdit = this.productModalMode() === 'edit' && !!selectedProduct;
      let savedProduct: Product;

      if (isEdit) {
        savedProduct = await this.productsService.updateProduct(selectedProduct.id, payload);
      } else {
        savedProduct = await this.productsService.createProduct(payload);
      }

      await this.saveProductMediaUsage(savedProduct, payload.media_id);

      await this.loadProducts();
      await this.loadCategories();
      this.clearFilters();
      this.viewMode.set('list');
      if (isEdit) {
        this.toast.updated('Product');
      } else {
        this.toast.created('Product');
      }
      this.closeProductModal();
    } catch (error) {
      console.error('Product save failed.', error);
      const message =
        error instanceof Error && error.message.startsWith('PRODUCTS.')
          ? error.message
          : 'PRODUCTS.SAVE_FAILED';
      this.imageUploadError.set(message);
      this.toast.failed('Saving product', this.errorDetail(error, 'Unable to save product.'));
    } finally {
      this.saving.set(false);
    }
  }

  updateProductForm<K extends keyof ProductFormModel>(key: K, value: ProductFormModel[K]): void {
    this.productForm.update((form) => ({
      ...form,
      [key]: value,
    }));
  }

  viewProduct(row: AdminTableRow): void {
    console.log('TODO: view product', row);
  }

  async deleteProductRow(row: AdminTableRow): Promise<void> {
    await this.deleteProduct(row as unknown as Product);
  }

  openPriceRange(): void {
    const ranges: ProductPriceRange[] = ['all', 'under_25', '25_50', '50_75', 'over_75'];
    const nextIndex = (ranges.indexOf(this.selectedPriceRange()) + 1) % ranges.length;
    this.selectedPriceRange.set(ranges[nextIndex]);
  }

  categoryLabel(product: Product): string {
    if (!product.category_id) {
      return 'Uncategorized';
    }

    const category = this.categoryById(product.category_id);

    if (category) {
      return this.categoryHierarchyLabel(category);
    }

    return product.categoryName ?? 'Uncategorized';
  }

  categoryHierarchyLabel(category: Category): string {
    const parent = this.parentCategory(category);

    if (!parent) {
      return category.name;
    }

    return `${parent.name} / ${category.name}`;
  }

  productStatus(product: Product): ProductStatus {
    return this.productsService.getProductStatus(product.stock);
  }

  formatPrice(product: Product): string {
    return this.formatCurrency(product.sale_price ?? product.price);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  productInitials(product: Product): string {
    return product.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  stockTextClass(product: Product): string {
    const status = this.productStatus(product);

    if (status === 'out_of_stock') {
      return 'text-[#dc3f35]';
    }

    if (status === 'low_stock') {
      return 'text-[#d98916]';
    }

    return 'text-[#182116]';
  }

  statusBadgeClass(product: Product): string {
    const status = this.productStatus(product);

    if (status === 'out_of_stock') {
      return 'bg-[#fff1f0] text-[#b42318]';
    }

    if (status === 'low_stock') {
      return 'bg-[#fff6e7] text-[#a66309]';
    }

    return 'bg-[#e9f8ef] text-[#117047]';
  }

  statusLabelKey(product: Product): string {
    return `PRODUCTS.STATUS.${this.productStatus(product).toUpperCase()}`;
  }

  priceRangeLabelKey(): string {
    return `PRODUCTS.PRICE_RANGES.${this.selectedPriceRange().toUpperCase()}`;
  }

  emptyTitleKey(): string {
    return this.products().length === 0 ? 'PRODUCTS.EMPTY_TITLE' : 'PRODUCTS.NO_MATCHING_TITLE';
  }

  emptyTextKey(): string {
    return this.products().length === 0 ? 'PRODUCTS.EMPTY_TEXT' : 'PRODUCTS.NO_MATCHING_TEXT';
  }

  productModalTitleKey(): string {
    return this.productModalMode() === 'edit' ? 'PRODUCTS.EDIT_PRODUCT' : 'PRODUCTS.ADD_PRODUCT';
  }

  productModalSubtitleKey(): string {
    return this.productModalMode() === 'edit'
      ? 'PRODUCTS.EDIT_PRODUCT_SUBTITLE'
      : 'PRODUCTS.CREATE_PRODUCT_SUBTITLE';
  }

  private toTableRow(product: Product): ProductTableRow {
    const status = this.productStatus(product);
    const salePrice = product.sale_price ?? null;

    return {
      id: product.id,
      raw: product,
      product: {
        imageUrl: product.image_url,
        title: product.name,
        subtitle: `SKU: ${product.sku || '-'}`,
        initials: this.productInitials(product),
        featured: !!product.is_featured,
      },
      slug: product.slug || '-',
      sku: product.sku || '-',
      category: this.categoryLabel(product),
      price: {
        value: this.formatCurrency(salePrice ?? product.price),
        originalValue: salePrice ? this.formatCurrency(product.price) : null,
      },
      salePrice: salePrice === null ? '-' : this.formatCurrency(salePrice),
      stock: {
        value: product.stock ?? 0,
        status,
      },
      sold: product.sold_count ?? 0,
      rating: product.rating === null ? '-' : product.rating.toFixed(1),
      featured: this.booleanBadge(product.is_featured),
      newProduct: this.booleanBadge(product.is_new),
      active: this.booleanBadge(product.is_active, 'Active', 'Inactive'),
      status,
      createdAt: this.formatDate(product.created_at),
      shortDescription: product.short_description || '-',
      imageUrl: product.image_url || '-',
      actions: null,
    };
  }

  private booleanBadge(value: boolean | null, yesLabel = 'Yes', noLabel = 'No'): {
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
      className: noLabel === 'Inactive' ? 'bg-[#fff1f0] text-[#b42318]' : 'bg-[#f0ebe4] text-[#675f55]',
    };
  }

  private yesNo(value: boolean | null): string {
    return value ? 'Yes' : 'No';
  }

  private matchesPriceRange(price: number, priceRange: ProductPriceRange): boolean {
    switch (priceRange) {
      case 'under_25':
        return price < 25;
      case '25_50':
        return price >= 25 && price <= 50;
      case '50_75':
        return price > 50 && price <= 75;
      case 'over_75':
        return price > 75;
      case 'all':
      default:
        return true;
    }
  }

  private matchesCategoryFilter(product: Product, selectedCategory: CategoryFilterValue): boolean {
    if (selectedCategory === 'all') {
      return true;
    }

    if (selectedCategory === 'uncategorized') {
      return !product.category_id;
    }

    if (product.category_id === selectedCategory) {
      return true;
    }

    return this.childCategoryIds(selectedCategory).has(product.category_id ?? '');
  }

  private categoryById(categoryId: string): Category | null {
    return this.categoryRecords().find((category) => category.id === categoryId) ?? null;
  }

  private parentCategory(category: Category): Category | null {
    if (!category.parent_id) {
      return null;
    }

    return this.categoryById(category.parent_id);
  }

  private childCategoryIds(parentId: string): Set<string> {
    return new Set(
      this.categoryRecords()
        .filter((category) => category.parent_id === parentId)
        .map((category) => category.id)
    );
  }

  private validateImageFile(file: File): string | null {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'PRODUCTS.IMAGE_TYPE_ERROR';
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return 'PRODUCTS.IMAGE_SIZE_ERROR';
    }

    return null;
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private resetImageState(): void {
    this.selectedImageFile.set(null);
    this.selectedProductMedia.set(null);
    this.isProductMediaPickerOpen.set(false);
    this.imagePreviewUrl.set(null);
    this.imageUploadError.set(null);
  }

  private resetProductForm(): void {
    this.selectedProduct.set(null);
    this.productForm.set({ ...EMPTY_PRODUCT_FORM });
    this.resetImageState();
  }

  private buildProductPayload(imageUrl: string | null): ProductMutationPayload {
    const form = this.productForm();

    return {
      category_id: form.categoryId,
      media_id: form.mediaId,
      name: form.name.trim(),
      slug: form.slug.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price ?? 0),
      sale_price: form.salePrice === null || form.salePrice === undefined ? null : Number(form.salePrice),
      stock: form.stock === null || form.stock === undefined ? null : Number(form.stock),
      sold_count: form.soldCount === null || form.soldCount === undefined ? null : Number(form.soldCount),
      rating: form.rating === null || form.rating === undefined ? null : Number(form.rating),
      short_description: form.shortDescription.trim() || null,
      description: form.description.trim() || null,
      image_url: imageUrl,
      gallery: form.gallery,
      is_featured: form.isFeatured,
      is_new: form.isNew,
      is_active: form.isActive,
    };
  }

  clearSelectedProducts(): void {
    this.selectedProductIds.set(new Set());
    this.tableSelectionResetKey.update((value) => value + 1);
  }

  openBulkStatus(): void {
    this.toast.info('Change status', 'Bulk status action will be added here.');
  }

  openDeleteSelectedProductsModal(): void {
    if (this.selectedProductsCount() === 0 || this.saving()) {
      return;
    }

    this.isDeleteSelectedProductsModalOpen.set(true);
  }

  closeDeleteSelectedProductsModal(): void {
    if (this.saving()) {
      return;
    }

    this.isDeleteSelectedProductsModalOpen.set(false);
  }

  async confirmDeleteSelectedProducts(): Promise<void> {
    const selectedIds = Array.from(this.selectedProductIds());

    if (selectedIds.length === 0 || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await Promise.all(
        selectedIds.map((productId) => this.productsService.deleteProduct(productId))
      );

      this.isDeleteSelectedProductsModalOpen.set(false);
      this.clearSelectedProducts();

      await this.loadProducts();

      this.toast.success(
        `${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} deleted successfully.`,
        'Selected products have been removed.'
      );
    } catch (error) {
      this.toast.failed(
        'Deleting selected products',
        this.errorDetail(error, 'Unable to delete selected products.')
      );
    } finally {
      this.saving.set(false);
    }
  }

  openDeleteProductModal(value: Product | AdminTableRow): void {
    const product = this.resolveProductFromTableEvent(value);

    if (!product) {
      this.toast.failed('Opening delete modal', 'Product data is missing.');
      return;
    }

    this.productPendingDelete.set(product);
    this.isDeleteProductModalOpen.set(true);
  }

  private resolveProductFromTableEvent(value: Product | AdminTableRow): Product | null {
    const row = value as AdminTableRow;

    if (row.raw) {
      return row.raw as Product;
    }

    const product = value as Product;

    if (product?.id && product?.name) {
      return product;
    }

    return null;
  }

  closeDeleteProductModal(): void {
    if (this.saving()) {
      return;
    }

    this.isDeleteProductModalOpen.set(false);
    this.productPendingDelete.set(null);
  }

  async confirmDeleteProduct(): Promise<void> {
    const product = this.productPendingDelete();

    if (!product || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await this.productsService.deleteProduct(product.id);

      this.isDeleteProductModalOpen.set(false);
      this.productPendingDelete.set(null);

      await this.loadProducts();

      this.toast.deleted('Product');
    } catch (error) {
      this.toast.failed(
        'Deleting product',
        this.errorDetail(error, 'Unable to delete product.')
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async saveProductMediaUsage(product: Product, mediaId: string | null | undefined): Promise<void> {
    if (!mediaId) {
      return;
    }

    try {
      await this.mediaLibraryService.setPrimaryMediaUsage({
        media_id: mediaId,
        entity_type: 'product',
        entity_id: product.id,
        usage_type: 'main_image',
      });
    } catch {
      this.toast.warn(
        'Media usage not linked',
        'Product was saved, but media usage tracking could not be updated.'
      );
    }
  }
}
