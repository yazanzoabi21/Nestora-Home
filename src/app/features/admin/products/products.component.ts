import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  ProductVariantFormModel,
  ProductVariantMutationPayload,
  ProductsService,
  UploadService,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { LoyaltyPointsCalculatorService } from '../../customer/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import {
  AdminTableColumn,
  AdminTableRow,
  AdminTableComponent,
} from '../../../shared/ui/admin-table';
import { ExportReportComponent, ExportReportConfig } from '../../../shared/ui/export-report';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';
import { MediaPickerModalComponent } from '../../../shared/ui/media-picker-modal';
import { AdminPaginationComponent, PaginationPageSize } from '../../../shared/ui/admin-pagination';
import {
  ProductImageGalleryComponent,
  ProductImageItem,
} from '../../../shared/ui/product-image-gallery';
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
  features: [],
  isFeatured: false,
  isNew: false,
  isActive: true,
  isLoyaltyEligible: true,
  hasVariants: false,
};

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    AdminFormModalComponent,
    AdminFormFieldComponent,
    AdminPaginationComponent,
    AdminTableComponent,
    CommonModule,
    ExportReportComponent,
    FormsModule,
    KpiCardComponent,
    MediaPickerModalComponent,
    ProductImageGalleryComponent,
    TranslatePipe,
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit {
  readonly loyalty = inject(LoyaltyPointsCalculatorService);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly mediaLibraryService = inject(MediaLibraryService);
  private readonly uploadService = inject(UploadService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly products = signal<Product[]>([]);
  readonly categoryRecords = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly featureError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly selectedCategory = signal<CategoryFilterValue>('all');
  readonly selectedStatus = signal<ProductStatusFilter>('all');
  readonly selectedPriceRange = signal<ProductPriceRange>('all');
  readonly viewMode = signal<ViewMode>('list');
  readonly gridCurrentPage = signal(1);
  readonly gridPageSize = signal<PaginationPageSize>(10);
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
  readonly loyaltyPreview = computed(() => this.loyalty.preview(
    this.productForm().price,
    this.productForm().salePrice,
  ));
  readonly productImages = signal<ProductImageItem[]>([]);
  readonly productVariants = signal<ProductVariantFormModel[]>([]);
  readonly variantError = signal<string | null>(null);
  readonly variantMediaTargetId = signal<string | null>(null);
  readonly coverImageId = signal<string | null>(null);
  readonly isProductMediaPickerOpen = signal(false);
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
      .sort((first, second) => first.label.localeCompare(second.label)),
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
      const matchesStatus =
        selectedStatus === 'all' || this.productStatus(product) === selectedStatus;
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
      },
    ),
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
    this.filteredProducts().map((product) => this.toTableRow(product)),
  );
  readonly paginatedGridProducts = computed(() => {
    const products = this.filteredProducts();
    const pageSize = this.gridPageSize();
    if (pageSize === 'all') return products;
    const start = (this.gridCurrentPage() - 1) * pageSize;
    return products.slice(start, start + pageSize);
  });
  readonly showGridPagination = computed(() => {
    const pageSize = this.gridPageSize();
    return pageSize === 'all' || this.filteredProducts().length > pageSize;
  });

  readonly productsExportConfig = computed<ExportReportConfig>(() => {
    const products = this.filteredProducts();

    return {
      fileName: 'nestora-products-report',
      reportTitle: 'Nestora Home - Products Report',
      reportSubtitle: `${products.length} products exported`,
      orientation: 'landscape',
      summaryItems: [
        { label: 'Total Products', value: products.length },
        {
          label: 'In Stock',
          value: products.filter((product) => this.productStatus(product) === 'in_stock').length,
        },
        {
          label: 'Low Stock',
          value: products.filter((product) => this.productStatus(product) === 'low_stock').length,
        },
        {
          label: 'Out of Stock',
          value: products.filter((product) => this.productStatus(product) === 'out_of_stock')
            .length,
        },
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
      this.selectedPriceRange() !== 'all',
  );

  async ngOnInit(): Promise<void> {
    this.watchQuerySearch();
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
      this.toast.failed(
        'Loading categories',
        this.errorDetail(error, 'Unable to load categories.'),
      );
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.gridCurrentPage.set(1);
  }

  updateSearchTerm(value: unknown): void {
    this.searchTerm.set(String(value ?? ''));
    this.gridCurrentPage.set(1);
  }

  updateCategoryFilter(value: CategoryFilterValue): void {
    this.selectedCategory.set(value);
    this.gridCurrentPage.set(1);
  }

  updateStatusFilter(value: ProductStatusFilter): void {
    this.selectedStatus.set(value);
    this.gridCurrentPage.set(1);
  }

  setGridPage(page: number): void {
    this.gridCurrentPage.set(page);
  }

  setGridPageSize(pageSize: PaginationPageSize): void {
    this.gridPageSize.set(pageSize);
    this.gridCurrentPage.set(1);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('all');
    this.selectedStatus.set('all');
    this.selectedPriceRange.set('all');
    this.gridCurrentPage.set(1);
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
    this.productVariants.set([]);
    this.variantError.set(null);
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
      features: this.normalizeFeatures(product.features),
      isFeatured: !!product.is_featured,
      isNew: !!product.is_new,
      isActive: product.is_active !== false,
      isLoyaltyEligible: product.is_loyalty_eligible !== false,
      hasVariants: (product.product_variants?.length ?? 0) > 0,
    });

    this.productVariants.set(
      (product.product_variants ?? []).map((variant) => ({
        clientId: variant.id,
        id: variant.id,
        optionName: variant.option_name,
        optionValue: variant.option_value,
        name: variant.name ?? '',
        sku: variant.sku ?? '',
        price: variant.price,
        salePrice: variant.sale_price,
        stock: variant.stock,
        attributes: variant.attributes ?? {},
        attributesText: this.formatVariantAttributes(variant.attributes ?? {}),
        mediaId: variant.media_id,
        imageUrl: variant.image_url ?? '',
        imageFile: null,
        isActive: variant.is_active !== false,
      })),
    );
    this.variantError.set(null);

    const images = this.productImageUrls(product).map((url, index) => ({
      id: `existing-${index}-${url}`,
      url,
      name: `${product.name} ${index + 1}`,
      mediaId: index === 0 ? (product.media_id ?? undefined) : undefined,
    }));
    this.productImages.set(images);
    this.coverImageId.set(images[0]?.id ?? null);
    this.imageUploadError.set(null);
    this.isProductModalOpen.set(true);
  }

  closeProductModal(): void {
    this.isProductModalOpen.set(false);
    this.resetProductForm();
  }

  onImagesSelected(files: File[]): void {
    const valid: ProductImageItem[] = [];
    const existingKeys = new Set(
      this.productImages().map((image) => this.imageKey(image.file, image.url)),
    );
    for (const file of files) {
      const error = this.validateImageFile(file);
      if (error) {
        this.imageUploadError.set(error);
        continue;
      }
      const key = this.imageKey(file);
      if (existingKeys.has(key)) {
        this.imageUploadError.set('PRODUCTS.IMAGES.DUPLICATE');
        continue;
      }
      existingKeys.add(key);
      valid.push({
        id: `local-${crypto.randomUUID()}`,
        url: URL.createObjectURL(file),
        name: file.name,
        file,
      });
    }
    if (valid.length) {
      this.productImages.update((images) => [...images, ...valid]);
      this.coverImageId.update((id) => id ?? valid[0].id);
      if (!this.imageUploadError()) this.imageUploadError.set(null);
    }
  }

  removeProductImage(id: string): void {
    const removed = this.productImages().find((image) => image.id === id);
    if (removed?.file) URL.revokeObjectURL(removed.url);
    this.productImages.update((images) => images.filter((image) => image.id !== id));
    if (this.coverImageId() === id) this.coverImageId.set(this.productImages()[0]?.id ?? null);
    this.imageUploadError.set(null);
  }

  setCoverImage(id: string): void {
    this.coverImageId.set(id);
  }

  moveProductImage(event: { id: string; direction: -1 | 1 }): void {
    this.productImages.update((images) => {
      const from = images.findIndex((image) => image.id === event.id);
      const to = from + event.direction;
      if (from < 0 || to < 0 || to >= images.length) return images;
      const reordered = [...images];
      [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
      return reordered;
    });
  }

  openProductMediaPicker(): void {
    if (this.saving()) {
      return;
    }

    this.variantMediaTargetId.set(null);
    this.isProductMediaPickerOpen.set(true);
  }

  closeProductMediaPicker(): void {
    this.isProductMediaPickerOpen.set(false);
    this.variantMediaTargetId.set(null);
  }

  selectProductMedia(asset: MediaAsset): void {
    if (this.productImages().some((image) => image.url === asset.file_url)) {
      this.imageUploadError.set('PRODUCTS.IMAGES.DUPLICATE');
      return;
    }
    const image = {
      id: `media-${asset.id}`,
      url: asset.file_url,
      name: asset.alt_text || asset.title || asset.file_name,
      mediaId: asset.id,
    };
    this.productImages.update((images) => [...images, image]);
    this.coverImageId.update((id) => id ?? image.id);
    this.imageUploadError.set(null);
  }

  async saveProduct(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.imageUploadError.set(null);
    const uploadedUrls: string[] = [];
    const variantUploadedUrls: string[] = [];

    try {
      const variantValidationError = this.validateVariants();
      if (variantValidationError) {
        this.variantError.set(variantValidationError);
        throw new Error(variantValidationError);
      }

      const resolvedImages: ProductImageItem[] = [];
      try {
        for (const image of this.productImages()) {
          if (!image.file) {
            resolvedImages.push(image);
            continue;
          }
          const url = await this.uploadService.uploadProductImage(image.file);
          uploadedUrls.push(url);
          resolvedImages.push({ ...image, url, file: undefined });
        }
      } catch (error) {
        await Promise.allSettled(
          uploadedUrls.map((url) => this.uploadService.deleteProductImage(url)),
        );
        throw new Error('PRODUCTS.UPLOAD_FAILED', { cause: error });
      }
      const cover =
        resolvedImages.find((image) => image.id === this.coverImageId()) ?? resolvedImages[0];
      const gallery = resolvedImages
        .filter((image) => image.id !== cover?.id)
        .map((image) => image.url);
      const payload = this.buildProductPayload(cover?.url ?? null, gallery, cover?.mediaId ?? null);
      const resolvedVariants = this.productForm().hasVariants ? await Promise.all(
        this.productVariants().map(async (variant, index): Promise<ProductVariantMutationPayload> => {
          const assignedGalleryIndex = this.productImages().findIndex(
            (image) => image.url === variant.imageUrl,
          );
          let imageUrl =
            assignedGalleryIndex >= 0
              ? resolvedImages[assignedGalleryIndex]?.url ?? null
              : variant.imageUrl.trim() || null;
          if (variant.imageFile) {
            imageUrl = await this.uploadService.uploadProductImage(variant.imageFile);
            variantUploadedUrls.push(imageUrl);
          }
          return {
            option_name: variant.optionName.trim(),
            option_value: variant.optionValue.trim(),
            name: variant.name.trim() || null,
            sku: variant.sku.trim() || null,
            price: variant.price,
            sale_price: variant.salePrice,
            stock: variant.stock,
            attributes: this.parseVariantAttributes(variant.attributesText),
            media_id: variant.mediaId,
            image_url: imageUrl,
            is_active: variant.isActive,
            sort_order: index,
          };
        }),
      ) : [];
      const selectedProduct = this.selectedProduct();
      const isEdit = this.productModalMode() === 'edit' && !!selectedProduct;
      let savedProduct: Product;

      if (isEdit) {
        savedProduct = await this.productsService.updateProduct(selectedProduct.id, payload);
      } else {
        savedProduct = await this.productsService.createProduct(payload);
      }

      await this.productsService.replaceProductVariants(
        savedProduct.id,
        this.productForm().hasVariants ? resolvedVariants : [],
      );

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
      await Promise.allSettled(
        [...uploadedUrls, ...variantUploadedUrls].map((url) =>
          this.uploadService.deleteProductImage(url),
        ),
      );
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

  toggleProductVariants(enabled: boolean): void {
    this.updateProductForm('hasVariants', enabled);
    if (enabled && this.productVariants().length === 0) this.addVariant();
    this.variantError.set(null);
  }

  addVariant(): void {
    this.productVariants.update((variants) => [
      ...variants,
      {
        clientId: crypto.randomUUID(),
        id: null,
        optionName: variants[0]?.optionName ?? '',
        optionValue: '',
        name: '',
        sku: '',
        price: null,
        salePrice: null,
        stock: null,
        attributes: {},
        attributesText: '',
        mediaId: null,
        imageUrl: '',
        imageFile: null,
        isActive: true,
      },
    ]);
    this.variantError.set(null);
  }

  updateVariant<K extends keyof ProductVariantFormModel>(
    clientId: string,
    key: K,
    value: ProductVariantFormModel[K],
  ): void {
    this.productVariants.update((variants) =>
      variants.map((variant) =>
        variant.clientId === clientId ? { ...variant, [key]: value } : variant,
      ),
    );
    this.variantError.set(null);
  }

  removeVariant(clientId: string): void {
    const variant = this.productVariants().find((item) => item.clientId === clientId);
    if (variant?.imageFile && variant.imageUrl) URL.revokeObjectURL(variant.imageUrl);
    this.productVariants.update((variants) =>
      variants.filter((item) => item.clientId !== clientId),
    );
  }

  moveVariant(index: number, direction: -1 | 1): void {
    this.productVariants.update((variants) => {
      const target = index + direction;
      if (target < 0 || target >= variants.length) return variants;
      const reordered = [...variants];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  onVariantImageSelected(clientId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const error = this.validateImageFile(file);
    if (error) {
      this.variantError.set(error);
      return;
    }
    const current = this.productVariants().find((variant) => variant.clientId === clientId);
    if (current?.imageFile && current.imageUrl) URL.revokeObjectURL(current.imageUrl);
    this.updateVariant(clientId, 'imageFile', file);
    this.updateVariant(clientId, 'imageUrl', URL.createObjectURL(file));
    this.updateVariant(clientId, 'mediaId', null);
  }

  removeVariantImage(clientId: string): void {
    const variant = this.productVariants().find((item) => item.clientId === clientId);
    if (!variant) return;
    if (variant.imageFile && variant.imageUrl) URL.revokeObjectURL(variant.imageUrl);
    this.productVariants.update((variants) =>
      variants.map((item) =>
        item.clientId === clientId
          ? { ...item, imageUrl: '', imageFile: null, mediaId: null }
          : item,
      ),
    );
    this.variantError.set(null);
  }

  assignGalleryImageToVariant(clientId: string, imageUrl: string): void {
    this.updateVariant(clientId, 'imageUrl', imageUrl);
    const mediaId = this.productImages().find((image) => image.url === imageUrl)?.mediaId ?? null;
    this.updateVariant(clientId, 'mediaId', mediaId);
    this.updateVariant(clientId, 'imageFile', null);
  }

  openVariantMediaPicker(clientId: string): void {
    this.variantMediaTargetId.set(clientId);
    this.isProductMediaPickerOpen.set(true);
  }

  addFeature(): void {
    if (this.productForm().features.length >= 20) {
      this.featureError.set('PRODUCTS.FEATURES.LIMIT_ERROR');
      return;
    }
    this.productForm.update((form) => ({ ...form, features: [...form.features, ''] }));
    this.featureError.set(null);
  }

  updateFeature(index: number, value: string): void {
    const features = [...this.productForm().features];
    features[index] = value.slice(0, 200);
    this.productForm.update((form) => ({ ...form, features }));
    this.featureError.set(null);
  }

  removeFeature(index: number): void {
    this.productForm.update((form) => ({
      ...form,
      features: form.features.filter((_, featureIndex) => featureIndex !== index),
    }));
    this.featureError.set(null);
  }

  moveFeature(index: number, direction: -1 | 1): void {
    const features = [...this.productForm().features];
    const target = index + direction;
    if (target < 0 || target >= features.length) return;
    [features[index], features[target]] = [features[target], features[index]];
    this.productForm.update((form) => ({ ...form, features }));
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
    this.gridCurrentPage.set(1);
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

  private booleanBadge(
    value: boolean | null,
    yesLabel = 'Yes',
    noLabel = 'No',
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
      className:
        noLabel === 'Inactive' ? 'bg-[#fff1f0] text-[#b42318]' : 'bg-[#f0ebe4] text-[#675f55]',
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
        .map((category) => category.id),
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
    this.productImages().forEach((image) => {
      if (image.file) URL.revokeObjectURL(image.url);
    });
    this.productImages.set([]);
    this.coverImageId.set(null);
    this.isProductMediaPickerOpen.set(false);
    this.variantMediaTargetId.set(null);
    this.imageUploadError.set(null);
  }

  private resetProductForm(): void {
    this.selectedProduct.set(null);
    this.productForm.set({ ...EMPTY_PRODUCT_FORM });
    for (const variant of this.productVariants()) {
      if (variant.imageFile && variant.imageUrl) URL.revokeObjectURL(variant.imageUrl);
    }
    this.productVariants.set([]);
    this.variantError.set(null);
    this.variantMediaTargetId.set(null);
    this.resetImageState();
  }

  private buildProductPayload(
    imageUrl: string | null,
    gallery: string[],
    mediaId: string | null,
  ): ProductMutationPayload {
    const form = this.productForm();

    return {
      category_id: form.categoryId,
      media_id: mediaId,
      name: form.name.trim(),
      slug: form.slug.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price ?? 0),
      sale_price:
        form.salePrice === null || form.salePrice === undefined ? null : Number(form.salePrice),
      stock: form.stock === null || form.stock === undefined ? null : Number(form.stock),
      sold_count:
        form.soldCount === null || form.soldCount === undefined ? null : Number(form.soldCount),
      rating: form.rating === null || form.rating === undefined ? null : Number(form.rating),
      short_description: form.shortDescription.trim() || null,
      description: form.description.trim() || null,
      image_url: imageUrl,
      gallery,
      features: [...new Set(form.features.map((feature) => feature.trim()).filter(Boolean))],
      is_featured: form.isFeatured,
      is_new: form.isNew,
      is_active: form.isActive,
      is_loyalty_eligible: form.isLoyaltyEligible,
    };
  }

  private normalizeFeatures(features: string[] | null | undefined): string[] {
    if (!Array.isArray(features)) return [];
    return features.filter((feature): feature is string => typeof feature === 'string');
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
        selectedIds.map((productId) => this.productsService.deleteProduct(productId)),
      );

      this.isDeleteSelectedProductsModalOpen.set(false);
      this.clearSelectedProducts();

      await this.loadProducts();

      this.toast.success(
        `${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} deleted successfully.`,
        'Selected products have been removed.',
      );
    } catch (error) {
      this.toast.failed(
        'Deleting selected products',
        this.errorDetail(error, 'Unable to delete selected products.'),
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
      this.toast.failed('Deleting product', this.errorDetail(error, 'Unable to delete product.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async saveProductMediaUsage(
    product: Product,
    mediaId: string | null | undefined,
  ): Promise<void> {
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
        'Product was saved, but media usage tracking could not be updated.',
      );
    }
  }

  selectProductMediaItems(assets: MediaAsset[]): void {
    for (const asset of assets) this.selectProductMedia(asset);
    this.isProductMediaPickerOpen.set(false);
  }

  selectVariantMedia(asset: MediaAsset): void {
    const targetId = this.variantMediaTargetId();
    if (!targetId) return;
    this.updateVariant(targetId, 'imageUrl', asset.file_url);
    this.updateVariant(targetId, 'mediaId', asset.id);
    this.updateVariant(targetId, 'imageFile', null);
    this.closeProductMediaPicker();
  }

  private validateVariants(): string | null {
    if (!this.productForm().hasVariants) return null;
    const variants = this.productVariants();
    if (!variants.length) return 'Add at least one product variant.';

    const combinations = new Set<string>();
    const skus = new Set<string>();
    for (const variant of variants) {
      const optionName = variant.optionName.trim();
      const optionValue = variant.optionValue.trim();
      if (!optionName || !optionValue) return 'Every variant needs an option name and value.';
      const combination = `${optionName.toLocaleLowerCase()}:${optionValue.toLocaleLowerCase()}`;
      if (combinations.has(combination)) return 'Duplicate variant options are not allowed.';
      combinations.add(combination);

      const sku = variant.sku.trim().toLocaleLowerCase();
      if (sku && skus.has(sku)) return 'Variant SKUs must be unique.';
      if (sku) skus.add(sku);
      if (variant.price !== null && (!Number.isFinite(Number(variant.price)) || Number(variant.price) <= 0)) {
        return 'Variant prices must be greater than zero.';
      }
      if (variant.salePrice !== null) {
        const regularPrice = variant.price ?? this.productForm().price ?? 0;
        if (Number(variant.salePrice) <= 0 || Number(variant.salePrice) >= Number(regularPrice)) {
          return 'Variant sale price must be lower than its effective regular price.';
        }
      }
      if (variant.stock !== null && (!Number.isInteger(Number(variant.stock)) || Number(variant.stock) < 0)) {
        return 'Variant stock must be a non-negative whole number.';
      }
    }
    return null;
  }

  private parseVariantAttributes(value: string): Readonly<Record<string, string>> {
    const attributes: Record<string, string> = {};
    for (const line of value.split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const attributeValue = line.slice(separator + 1).trim();
      if (key && attributeValue) attributes[key] = attributeValue;
    }
    return attributes;
  }

  private formatVariantAttributes(attributes: Readonly<Record<string, string>>): string {
    return Object.entries(attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }

  private productImageUrls(product: Product): string[] {
    const gallery = Array.isArray(product.gallery) ? product.gallery : [];
    const urls = gallery.map((item) => (typeof item === 'string' ? item : item.url));
    return [...new Set([product.image_url, ...urls].filter((url): url is string => !!url))];
  }

  private imageKey(file?: File, url = ''): string {
    return file ? `${file.name.toLowerCase()}-${file.size}-${file.lastModified}` : url;
  }

  private watchQuerySearch(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.searchTerm.set(params.get('q') ?? '');
        this.gridCurrentPage.set(1);
      });
  }
}
