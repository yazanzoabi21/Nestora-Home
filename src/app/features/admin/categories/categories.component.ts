import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CategoriesService, Category, CategoryMutationPayload, UploadService } from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableRow } from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type CategoryModalMode = 'add-parent' | 'add-child' | 'edit';
type ViewMode = 'tree' | 'grid';
type CategoryAssetMode = 'icon' | 'upload';

interface CategoryFormModel {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
}

const EMPTY_CATEGORY_FORM: CategoryFormModel = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
};

const DEFAULT_CATEGORY_ICON = 'pi pi-box';
const CATEGORY_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
const MAIN_CATEGORY_ICON_OPTIONS = [
  'pi pi-box',
  'pi pi-tags',
  'pi pi-shopping-bag',
  'pi pi-home',
  'pi pi-star',
  'pi pi-heart',
  'pi pi-gift',
  'pi pi-sparkles',
  'pi pi-wrench',
  'pi pi-cog',
  'pi pi-palette',
  'pi pi-table',
  'pi pi-car',
  'pi pi-mobile',
  'pi pi-desktop',
  'pi pi-camera',
  'pi pi-image',
  'pi pi-book',
  'pi pi-briefcase',
  'pi pi-th-large',
];

const MORE_CATEGORY_ICON_OPTIONS = [
  'pi pi-shop',
  'pi pi-building',
  'pi pi-warehouse',
  'pi pi-truck',
  'pi pi-shopping-cart',
  'pi pi-cart-plus',
  'pi pi-credit-card',
  'pi pi-wallet',
  'pi pi-percentage',
  'pi pi-dollar',
  'pi pi-bolt',
  'pi pi-shield',
  'pi pi-lock',
  'pi pi-key',
  'pi pi-globe',
  'pi pi-map-marker',
  'pi pi-calendar',
  'pi pi-clock',
  'pi pi-bell',
  'pi pi-send',
  'pi pi-envelope',
  'pi pi-phone',
  'pi pi-users',
  'pi pi-user',
  'pi pi-chart-bar',
  'pi pi-chart-line',
  'pi pi-filter',
  'pi pi-sliders-h',
  'pi pi-list',
  'pi pi-folder',
  'pi pi-file',
  'pi pi-print',
];

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    CommonModule,
    FormsModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.css',
})
export class CategoriesComponent implements OnInit {
  private readonly categoriesService = inject(CategoriesService);
  private readonly uploadService = inject(UploadService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly viewMode = signal<ViewMode>('tree');
  readonly categoryModalMode = signal<CategoryModalMode>('add-parent');
  readonly isCategoryModalOpen = signal(false);
  readonly isDeleteCategoryModalOpen = signal(false);
  readonly selectedCategory = signal<Category | null>(null);
  readonly selectedParentCategory = signal<Category | null>(null);
  readonly categoryPendingDelete = signal<Category | null>(null);
  readonly categoryForm = signal<CategoryFormModel>({ ...EMPTY_CATEGORY_FORM });
  readonly slugEdited = signal(false);
  readonly assetMode = signal<CategoryAssetMode>('icon');
  readonly selectedCategoryImageFile = signal<File | null>(null);
  readonly imagePreviewUrl = signal<string | null>(null);
  readonly selectedIcon = signal(DEFAULT_CATEGORY_ICON);
  readonly expandedCategoryIds = signal<Set<string>>(new Set());

  // readonly categoryIconOptions = CATEGORY_ICON_OPTIONS;
  readonly showMoreIcons = signal(false);
  readonly mainCategoryIconOptions = MAIN_CATEGORY_ICON_OPTIONS;
  readonly moreCategoryIconOptions = MORE_CATEGORY_ICON_OPTIONS;

  readonly categoryImageAccept = CATEGORY_IMAGE_ACCEPT;
  readonly defaultCategoryIcon = DEFAULT_CATEGORY_ICON;

  readonly filteredCategories = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();

    if (!searchTerm) {
      return this.categories();
    }

    return this.categories().filter((category) => {
      const productCount = category.products_count ?? 0;

      return (
        category.name.toLowerCase().includes(searchTerm) ||
        category.slug.toLowerCase().includes(searchTerm) ||
        (category.description ?? '').toLowerCase().includes(searchTerm) ||
        `${productCount} products`.includes(searchTerm)
      );
    });
  });

  readonly stats = computed(() => {
    const categories = this.categories();
    const now = Date.now();
    const recentLimit = 1000 * 60 * 60 * 24 * 30;

    return {
      total: categories.length,
      withProducts: categories.filter((category) => (category.products_count ?? 0) > 0).length,
      empty: categories.filter((category) => (category.products_count ?? 0) === 0).length,
      recent: categories.filter((category) => {
        if (!category.created_at) {
          return false;
        }

        return now - new Date(category.created_at).getTime() <= recentLimit;
      }).length,
    };
  });

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Total Categories',
        titleKey: 'CATEGORIES.STATS.TOTAL_CATEGORIES',
        value: stats.total.toString(),
        icon: 'pi pi-tags',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'With Products',
        titleKey: 'CATEGORIES.STATS.WITH_PRODUCTS',
        value: stats.withProducts.toString(),
        icon: 'pi pi-eye',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Empty Categories',
        titleKey: 'CATEGORIES.STATS.EMPTY_CATEGORIES',
        value: stats.empty.toString(),
        icon: 'pi pi-inbox',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Recently Added',
        titleKey: 'CATEGORIES.STATS.RECENTLY_ADDED',
        value: stats.recent.toString(),
        icon: 'pi pi-clock',
        iconColor: '#3b78d8',
        iconBg: '#eef4ff',
        showChart: false,
      },
    ];
  });

  readonly rootCategories = computed(() => this.filteredCategories().filter((category) => !category.parent_id));

  readonly selectedCategoryDetails = computed(() => {
    const selectedCategory = this.selectedCategory();
    const filteredCategories = this.filteredCategories();

    return selectedCategory ?? filteredCategories[0] ?? null;
  });

  readonly hasCategories = computed(() => this.categories().length > 0);

  readonly visibleCategoryIconOptions = computed(() =>
    this.showMoreIcons()
      ? [...this.mainCategoryIconOptions, ...this.moreCategoryIconOptions]
      : this.mainCategoryIconOptions
  );

  toggleMoreIcons(): void {
    this.showMoreIcons.update((value) => !value);
  }

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loading.set(true);

    try {
      const categories = await this.categoriesService.getCategoriesWithProductCount();
      this.categories.set(categories);

      if (!this.selectedCategory() && categories.length > 0) {
        this.selectedCategory.set(categories[0]);
      }
    } catch (error) {
      this.toast.failed(
        this.translate.instant('CATEGORIES.LOADING_CATEGORIES'),
        this.errorDetail(error, this.translate.instant('CATEGORIES.LOADING_CATEGORIES_FAILED'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  toggleExpanded(category: Category, event?: Event): void {
    event?.stopPropagation();

    if (this.childCategories(category.id).length === 0) {
      return;
    }

    const expandedIds = new Set(this.expandedCategoryIds());

    if (expandedIds.has(category.id)) {
      expandedIds.delete(category.id);
    } else {
      expandedIds.add(category.id);
    }

    this.expandedCategoryIds.set(expandedIds);
  }

  isExpanded(category: Category): boolean {
    return this.expandedCategoryIds().has(category.id);
  }

  openAddCategoryModal(): void {
    this.categoryModalMode.set('add-parent');
    this.selectedParentCategory.set(null);
    this.selectedCategory.set(null);
    this.slugEdited.set(false);
    this.categoryForm.set({ ...EMPTY_CATEGORY_FORM });
    this.resetAssetState();
    this.selectedIcon.set(DEFAULT_CATEGORY_ICON);
    this.categoryForm.update((form) => ({ ...form, imageUrl: DEFAULT_CATEGORY_ICON }));
    this.isCategoryModalOpen.set(true);
  }

  openAddChildCategoryModal(parent: Category): void {
    this.categoryModalMode.set('add-child');
    this.selectedParentCategory.set(parent);
    this.selectedCategory.set(parent);
    this.slugEdited.set(false);
    this.categoryForm.set({ ...EMPTY_CATEGORY_FORM });
    this.resetAssetState();
    this.selectedIcon.set(DEFAULT_CATEGORY_ICON);
    this.categoryForm.update((form) => ({ ...form, imageUrl: DEFAULT_CATEGORY_ICON }));
    this.isCategoryModalOpen.set(true);
  }

  openEditCategoryModal(value: Category | AdminTableRow): void {
    const category = this.resolveCategoryFromTableEvent(value);

    if (!category) {
      this.toast.failed(
        this.translate.instant('CATEGORIES.OPENING_CATEGORY'),
        this.translate.instant('CATEGORIES.CATEGORY_DATA_MISSING')
      );
      return;
    }

    this.categoryModalMode.set('edit');
    this.selectedParentCategory.set(this.parentCategory(category));
    this.selectedCategory.set(category);
    this.slugEdited.set(true);
    this.categoryForm.set({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      imageUrl: category.image_url ?? '',
    });
    this.loadAssetState(category.image_url);
    this.isCategoryModalOpen.set(true);
  }

  closeCategoryModal(): void {
    if (this.saving()) {
      return;
    }

    this.isCategoryModalOpen.set(false);
    this.resetCategoryForm();
  }

  updateCategoryForm<K extends keyof CategoryFormModel>(key: K, value: CategoryFormModel[K]): void {
    this.categoryForm.update((form) => {
      const nextForm = {
        ...form,
        [key]: value,
      };

      if (key === 'name' && this.categoryModalMode() !== 'edit' && !this.slugEdited()) {
        nextForm.slug = this.categoriesService.createSlug(String(value));
      }

      if (key === 'slug') {
        this.slugEdited.set(true);
      }

      return nextForm;
    });
  }

  setAssetMode(mode: CategoryAssetMode): void {
    this.assetMode.set(mode);

    if (mode === 'upload') {
      this.selectedIcon.set('');
      return;
    }

    this.selectedCategoryImageFile.set(null);
    this.imagePreviewUrl.set(null);
    const icon = this.selectedIcon() || DEFAULT_CATEGORY_ICON;
    this.selectedIcon.set(icon);
    this.categoryForm.update((form) => ({ ...form, imageUrl: icon }));
  }

  onCategoryImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!CATEGORY_IMAGE_ACCEPT.split(',').includes(file.type)) {
      this.toast.warn(
        this.translate.instant('CATEGORIES.UNSUPPORTED_IMAGE_TYPE'),
        this.translate.instant('CATEGORIES.IMAGE_TYPE_HELPER')
      );
      input.value = '';
      return;
    }

    this.assetMode.set('upload');
    this.selectedIcon.set('');
    this.selectedCategoryImageFile.set(file);
    this.imagePreviewUrl.set(URL.createObjectURL(file));
    this.categoryForm.update((form) => ({ ...form, imageUrl: form.imageUrl }));
  }

  selectIcon(icon: string): void {
    this.assetMode.set('icon');
    this.selectedCategoryImageFile.set(null);
    this.imagePreviewUrl.set(null);
    this.selectedIcon.set(icon);
    this.categoryForm.update((form) => ({ ...form, imageUrl: icon }));
  }

  async saveCategory(): Promise<void> {
    if (this.saving()) {
      return;
    }

    const payload = this.buildCategoryPayload();

    if (!payload.name || !payload.slug) {
      this.toast.warn(
        this.translate.instant('CATEGORIES.MISSING_CATEGORY_FIELDS'),
        this.translate.instant('CATEGORIES.NAME_SLUG_REQUIRED')
      );
      return;
    }

    this.saving.set(true);

    try {
      const selectedCategory = this.selectedCategory();
      const isEdit = this.categoryModalMode() === 'edit' && !!selectedCategory;
      const imageFile = this.selectedCategoryImageFile();
      const imageUrl = imageFile
        ? await this.uploadService.uploadCategoryImage(imageFile)
        : this.resolveCategoryImageValue(isEdit ? selectedCategory?.image_url ?? null : null);
      const payloadWithImage = {
        ...payload,
        image_url: imageUrl,
      };

      if (isEdit) {
        await this.categoriesService.updateCategory(selectedCategory.id, payloadWithImage);
      } else {
        await this.categoriesService.createCategory(payloadWithImage);
      }

      await this.loadCategories();
      this.isCategoryModalOpen.set(false);
      this.resetCategoryForm();

      if (isEdit) {
        this.toast.success(this.translate.instant('CATEGORIES.CATEGORY_UPDATED'));
      } else {
        this.toast.success(this.translate.instant('CATEGORIES.CATEGORY_CREATED'));
      }
    } catch (error) {
      this.toast.failed(
        this.translate.instant('CATEGORIES.SAVING_CATEGORY'),
        this.errorDetail(error, this.translate.instant('CATEGORIES.SAVING_CATEGORY_FAILED'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  openDeleteCategoryModal(value: Category | AdminTableRow): void {
    const category = this.resolveCategoryFromTableEvent(value);

    if (!category) {
      this.toast.failed(
        this.translate.instant('CATEGORIES.OPENING_DELETE_MODAL'),
        this.translate.instant('CATEGORIES.CATEGORY_DATA_MISSING')
      );
      return;
    }

    this.categoryPendingDelete.set(category);
    this.isDeleteCategoryModalOpen.set(true);
  }

  readonly deleteCategoryMessage = computed(() => {
    const category = this.categoryPendingDelete();

    if (!category) {
      return this.translate.instant('CATEGORIES.DELETE_FALLBACK_MESSAGE');
    }

    return this.translate.instant('CATEGORIES.DELETE_MESSAGE', { name: category.name });
  });

  closeDeleteCategoryModal(): void {
    if (this.saving()) {
      return;
    }

    this.isDeleteCategoryModalOpen.set(false);
    this.categoryPendingDelete.set(null);
  }

  async confirmDeleteCategory(): Promise<void> {
    const category = this.categoryPendingDelete();

    if (!category || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      await this.categoriesService.deleteCategory(category.id);
      this.isDeleteCategoryModalOpen.set(false);
      this.categoryPendingDelete.set(null);

      if (this.selectedCategory()?.id === category.id) {
        this.selectedCategory.set(null);
      }

      await this.loadCategories();
      this.toast.success(this.translate.instant('CATEGORIES.CATEGORY_DELETED'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('CATEGORIES.DELETING_CATEGORY'),
        this.errorDetail(error, this.translate.instant('CATEGORIES.DELETING_CATEGORY_FAILED'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  selectCategory(category: Category): void {
    this.selectedCategory.set(category);
  }

  categoryInitials(category: Category): string {
    return category.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  isIconValue(value: string | null | undefined): boolean {
    return !!value && (value.startsWith('pi ') || value.startsWith('fa ') || value.startsWith('fa-'));
  }

  categoryIconClass(category: Category): string {
    return this.isIconValue(category.image_url) ? category.image_url ?? DEFAULT_CATEGORY_ICON : DEFAULT_CATEGORY_ICON;
  }

  categoryImageUrl(category: Category): string | null {
    return category.image_url && !this.isIconValue(category.image_url) ? category.image_url : null;
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

  productCountLabel(category: Category): string {
    const count = category.products_count ?? 0;
    return this.translate.instant('CATEGORIES.PRODUCT_COUNT', {
      count,
      suffix: count === 1 ? '' : 's',
    });
  }

  childCategories(parentId: string): Category[] {
    return this.filteredCategories().filter((category) => category.parent_id === parentId);
  }

  parentCategory(category: Category): Category | null {
    if (!category.parent_id) {
      return null;
    }

    return this.categories().find((candidate) => candidate.id === category.parent_id) ?? null;
  }

  subCategoryCount(category: Category): number {
    return this.categories().filter((candidate) => candidate.parent_id === category.id).length;
  }

  isSelectedCategory(category: Category): boolean {
    return this.selectedCategory()?.id === category.id;
  }

  isHiddenCategory(category: Category): boolean {
    return category.is_active === false;
  }

  toggleCategoryVisibility(category: Category): void {
    this.toast.info(
      this.translate.instant(this.isHiddenCategory(category) ? 'CATEGORIES.SHOW_CATEGORY' : 'CATEGORIES.HIDE_CATEGORY'),
      this.translate.instant('CATEGORIES.VISIBILITY_NOT_AVAILABLE')
    );
  }

  categoryModalTitle(): string {
    switch (this.categoryModalMode()) {
      case 'add-child':
        return 'CATEGORIES.ADD_SUB_CATEGORY';
      case 'edit':
        return 'CATEGORIES.EDIT_CATEGORY';
      case 'add-parent':
      default:
        return 'CATEGORIES.ADD_CATEGORY';
    }
  }

  categoryModalSubtitle(): string {
    const parent = this.selectedParentCategory();

    switch (this.categoryModalMode()) {
      case 'add-child':
        return parent
          ? this.translate.instant('CATEGORIES.CREATE_CHILD_UNDER_SUBTITLE', { name: parent.name })
          : 'CATEGORIES.CREATE_CHILD_SUBTITLE';
      case 'edit':
        return 'CATEGORIES.EDIT_SUBTITLE';
      case 'add-parent':
      default:
        return 'CATEGORIES.CREATE_PARENT_SUBTITLE';
    }
  }

  private resolveCategoryFromTableEvent(value: Category | AdminTableRow): Category | null {
    const row = value as AdminTableRow;

    if (row.raw) {
      return row.raw as Category;
    }

    const category = value as Category;

    if (category?.id && category?.name) {
      return category;
    }

    return null;
  }

  private buildCategoryPayload(): CategoryMutationPayload {
    const form = this.categoryForm();

    return {
      name: form.name.trim(),
      parent_id: this.resolveParentIdForPayload(),
      slug: form.slug.trim() || this.categoriesService.createSlug(form.name),
      description: form.description.trim() || null,
      image_url: this.resolveCategoryImageValue(null),
    };
  }

  private resetCategoryForm(): void {
    this.selectedCategory.set(null);
    this.selectedParentCategory.set(null);
    this.slugEdited.set(false);
    this.categoryForm.set({ ...EMPTY_CATEGORY_FORM });
    this.resetAssetState();
  }

  private loadAssetState(value: string | null | undefined): void {
    this.selectedCategoryImageFile.set(null);

    if (this.isIconValue(value)) {
      this.assetMode.set('icon');
      this.selectedIcon.set(value ?? DEFAULT_CATEGORY_ICON);
      this.imagePreviewUrl.set(null);
      return;
    }

    if (value) {
      this.assetMode.set('upload');
      this.selectedIcon.set('');
      this.imagePreviewUrl.set(value);
      return;
    }

    this.assetMode.set('icon');
    this.selectedIcon.set(DEFAULT_CATEGORY_ICON);
    this.imagePreviewUrl.set(null);
  }

  private resetAssetState(): void {
    this.assetMode.set('icon');
    this.selectedCategoryImageFile.set(null);
    this.imagePreviewUrl.set(null);
    this.selectedIcon.set(DEFAULT_CATEGORY_ICON);
  }

  private resolveCategoryImageValue(existingValue: string | null): string {
    if (this.assetMode() === 'icon') {
      return this.selectedIcon() || DEFAULT_CATEGORY_ICON;
    }

    return this.imagePreviewUrl() || existingValue || DEFAULT_CATEGORY_ICON;
  }

  private resolveParentIdForPayload(): string | null {
    if (this.categoryModalMode() === 'add-child') {
      return this.selectedParentCategory()?.id ?? null;
    }

    if (this.categoryModalMode() === 'edit') {
      return this.selectedCategory()?.parent_id ?? null;
    }

    return null;
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
