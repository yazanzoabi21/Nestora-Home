import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  MediaAsset,
  MediaAssetPayload,
  MediaCategory,
  MediaFileType,
  MediaLibraryService,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent, AdminFormFieldValue } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { AdminTableColumn, AdminTableComponent, AdminTableRow } from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

type MediaFilter = 'all' | 'product' | 'promotion' | 'brand';
type MediaViewMode = 'grid' | 'list';

interface SelectOption<T extends string | boolean = string> {
  label: string;
  value: T;
}

interface MediaEditForm {
  title: string;
  altText: string;
  description: string;
  category: MediaCategory;
  fileType: MediaFileType;
  isActive: boolean;
}

type MediaTableRow = AdminTableRow & {
  asset: {
    imageUrl?: string | null;
    imageFallbackLabel?: string;
    title: string;
    subtitle?: string;
    initials?: string;
  };
  category: {
    labelKey: string;
    className: string;
  };
  fileType: string;
  fileSize: string;
  dimensions: string;
  createdAt: string;
  actions: null;
};

const EMPTY_MEDIA_FORM: MediaEditForm = {
  title: '',
  altText: '',
  description: '',
  category: 'general',
  fileType: 'image',
  isActive: true,
};

@Component({
  selector: 'app-media-library',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableComponent,
    CommonModule,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl: './media-library.component.html',
  styleUrl: './media-library.component.css',
})
export class MediaLibraryComponent implements OnInit {
  private readonly mediaLibraryService = inject(MediaLibraryService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly assets = signal<MediaAsset[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly saving = signal(false);
  readonly dragActive = signal(false);
  readonly searchTerm = signal('');
  readonly selectedFilter = signal<MediaFilter>('all');
  readonly viewMode = signal<MediaViewMode>('grid');
  readonly previewAsset = signal<MediaAsset | null>(null);
  readonly editingAsset = signal<MediaAsset | null>(null);
  readonly deletingAsset = signal<MediaAsset | null>(null);
  readonly failedImages = signal<Set<string>>(new Set());
  readonly mediaForm = signal<MediaEditForm>({ ...EMPTY_MEDIA_FORM });

  readonly filterOptions: Array<{ labelKey: string; value: MediaFilter }> = [
    { labelKey: 'MEDIA_LIBRARY.FILTERS.ALL', value: 'all' },
    { labelKey: 'MEDIA_LIBRARY.FILTERS.PRODUCTS', value: 'product' },
    { labelKey: 'MEDIA_LIBRARY.FILTERS.MARKETING', value: 'promotion' },
    { labelKey: 'MEDIA_LIBRARY.FILTERS.BRAND', value: 'brand' },
  ];

  readonly categoryOptions: SelectOption<MediaCategory>[] = [
    { label: 'MEDIA_LIBRARY.CATEGORIES.PRODUCT', value: 'product' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.CATEGORY', value: 'category' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.PROMOTION', value: 'promotion' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.BRAND', value: 'brand' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.AVATAR', value: 'avatar' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.REVIEW', value: 'review' },
    { label: 'MEDIA_LIBRARY.CATEGORIES.GENERAL', value: 'general' },
  ];

  readonly fileTypeOptions: SelectOption<MediaFileType>[] = [
    { label: 'MEDIA_LIBRARY.FILE_TYPES.IMAGE', value: 'image' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.VIDEO', value: 'video' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.DOCUMENT', value: 'document' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.LOGO', value: 'logo' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.BANNER', value: 'banner' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.AVATAR', value: 'avatar' },
    { label: 'MEDIA_LIBRARY.FILE_TYPES.OTHER', value: 'other' },
  ];

  readonly activeOptions: SelectOption<boolean>[] = [
    { label: 'COMMON.YES', value: true },
    { label: 'COMMON.NO', value: false },
  ];

  readonly tableColumns: AdminTableColumn[] = [
    { key: 'asset', label: 'MEDIA_LIBRARY.TABLE.ASSET', type: 'imageText' },
    { key: 'category', label: 'MEDIA_LIBRARY.TABLE.CATEGORY', type: 'badge' },
    { key: 'fileType', label: 'MEDIA_LIBRARY.TABLE.TYPE', type: 'text' },
    { key: 'fileSize', label: 'MEDIA_LIBRARY.TABLE.SIZE', type: 'text' },
    { key: 'dimensions', label: 'MEDIA_LIBRARY.TABLE.DIMENSIONS', type: 'text' },
    { key: 'createdAt', label: 'MEDIA_LIBRARY.TABLE.CREATED_AT', type: 'text' },
    { key: 'actions', label: 'MEDIA_LIBRARY.TABLE.ACTIONS', type: 'actions' },
  ];

  readonly stats = computed(() => this.mediaLibraryService.getStatsFromAssets(this.assets()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Total Files',
        titleKey: 'MEDIA_LIBRARY.KPI.TOTAL_FILES',
        value: stats.totalFiles.toString(),
        icon: 'pi pi-images',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Total Size',
        titleKey: 'MEDIA_LIBRARY.KPI.TOTAL_SIZE',
        value: this.formatFileSize(stats.totalSizeBytes),
        icon: 'pi pi-folder-open',
        iconColor: '#2f6fd0',
        iconBg: '#eaf2ff',
        showChart: false,
      },
      {
        title: 'Product Images',
        titleKey: 'MEDIA_LIBRARY.KPI.PRODUCT_IMAGES',
        value: stats.productImages.toString(),
        icon: 'pi pi-tag',
        iconColor: '#20a464',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Marketing Assets',
        titleKey: 'MEDIA_LIBRARY.KPI.MARKETING_ASSETS',
        value: stats.marketingAssets.toString(),
        icon: 'pi pi-megaphone',
        iconColor: '#8d877e',
        iconBg: '#f0ebe4',
        showChart: false,
      },
    ];
  });

  readonly filteredAssets = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const selectedFilter = this.selectedFilter();

    return this.assets().filter((asset) => {
      const searchable = [
        asset.file_name,
        asset.original_name ?? '',
        asset.title ?? '',
        asset.alt_text ?? '',
        asset.description ?? '',
        asset.category ?? '',
        asset.file_type ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return (!search || searchable.includes(search)) && (selectedFilter === 'all' || asset.category === selectedFilter);
    });
  });

  readonly tableRows = computed<MediaTableRow[]>(() => this.filteredAssets().map((asset) => this.toTableRow(asset)));

  async ngOnInit(): Promise<void> {
    await this.loadAssets();
  }

  async loadAssets(): Promise<void> {
    this.loading.set(true);

    try {
      this.assets.set(await this.mediaLibraryService.getMediaAssets());
    } catch (error) {
      this.toast.failed(
        this.translate.instant('MEDIA_LIBRARY.TOAST.LOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('MEDIA_LIBRARY.TOAST.LOAD_FAILED_DETAIL'))
      );
    } finally {
      this.loading.set(false);
    }
  }

  openFilePicker(input: HTMLInputElement, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.uploading()) {
      return;
    }

    input.value = '';
    input.click();
  }

  async onFileInputChange(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.uploadFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
    await this.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async uploadFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (!imageFiles.length) {
      return;
    }

    this.uploading.set(true);

    try {
      for (const file of imageFiles) {
        const uploaded = await this.mediaLibraryService.uploadMediaFile(file, 'product');
        this.assets.update((assets) => [uploaded, ...assets]);
      }

      this.toast.success(this.translate.instant('MEDIA_LIBRARY.TOAST.UPLOAD_SUCCESS'));
    } catch (error) {
      this.toast.failed(
        this.translate.instant('MEDIA_LIBRARY.TOAST.UPLOAD_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('MEDIA_LIBRARY.TOAST.UPLOAD_FAILED_DETAIL'))
      );
    } finally {
      this.uploading.set(false);
    }
  }

  setFilter(filter: MediaFilter): void {
    this.selectedFilter.set(filter);
  }

  setViewMode(viewMode: MediaViewMode): void {
    this.viewMode.set(viewMode);
  }

  openPreviewAsset(asset: MediaAsset | AdminTableRow): void {
    this.previewAsset.set(this.resolveAsset(asset));
  }

  closePreviewModal(): void {
    this.previewAsset.set(null);
  }

  openEditAsset(asset: MediaAsset | AdminTableRow): void {
    const resolvedAsset = this.resolveAsset(asset);

    if (!resolvedAsset) {
      return;
    }

    this.editingAsset.set(resolvedAsset);
    this.mediaForm.set({
      title: resolvedAsset.title ?? '',
      altText: resolvedAsset.alt_text ?? '',
      description: resolvedAsset.description ?? '',
      category: resolvedAsset.category ?? 'general',
      fileType: resolvedAsset.file_type ?? 'image',
      isActive: resolvedAsset.is_active ?? true,
    });
  }

  closeEditModal(): void {
    if (this.saving()) {
      return;
    }

    this.editingAsset.set(null);
    this.mediaForm.set({ ...EMPTY_MEDIA_FORM });
  }

  openDeleteAsset(asset: MediaAsset | AdminTableRow): void {
    this.deletingAsset.set(this.resolveAsset(asset));
  }

  closeDeleteModal(): void {
    if (this.saving()) {
      return;
    }

    this.deletingAsset.set(null);
  }

  async saveAsset(): Promise<void> {
    const asset = this.editingAsset();

    if (!asset) {
      return;
    }

    const form = this.mediaForm();
    const payload: Partial<MediaAssetPayload> = {
      title: form.title.trim() || null,
      alt_text: form.altText.trim() || null,
      description: form.description.trim() || null,
      category: form.category,
      file_type: form.fileType,
      is_active: form.isActive,
    };

    this.saving.set(true);

    try {
      const updatedAsset = await this.mediaLibraryService.updateMediaAsset(asset.id, payload);
      this.assets.update((items) => items.map((item) => (item.id === updatedAsset.id ? updatedAsset : item)));
      this.toast.updated(this.translate.instant('MEDIA_LIBRARY.MEDIA_ASSET'));
      this.closeEditModal();
    } catch (error) {
      this.toast.failed(
        this.translate.instant('MEDIA_LIBRARY.TOAST.SAVE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('MEDIA_LIBRARY.TOAST.SAVE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDeleteAsset(): Promise<void> {
    const asset = this.deletingAsset();

    if (!asset) {
      return;
    }

    this.saving.set(true);

    try {
      await this.mediaLibraryService.softDeleteMediaAsset(asset.id);
      this.assets.update((items) => items.filter((item) => item.id !== asset.id));
      this.toast.success(this.translate.instant('MEDIA_LIBRARY.TOAST.DELETE_SUCCESS'));
      this.closeDeleteModal();
    } catch (error) {
      this.toast.failed(
        this.translate.instant('MEDIA_LIBRARY.TOAST.DELETE_FAILED_TITLE'),
        this.errorDetail(error, this.translate.instant('MEDIA_LIBRARY.TOAST.DELETE_FAILED_DETAIL'))
      );
    } finally {
      this.saving.set(false);
    }
  }

  updateMediaForm<K extends keyof MediaEditForm>(key: K, value: AdminFormFieldValue): void {
    this.mediaForm.update((form) => ({
      ...form,
      [key]: value,
    }));
  }

  async copyUrl(asset: MediaAsset, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      await navigator.clipboard.writeText(asset.file_url);
      this.toast.success(this.translate.instant('MEDIA_LIBRARY.TOAST.COPY_SUCCESS'));
    } catch {
      this.toast.info(asset.file_url);
    }
  }

  openInNewTab(asset: MediaAsset): void {
    window.open(asset.file_url, '_blank', 'noopener,noreferrer');
  }

  handleImageError(assetId: string): void {
    this.failedImages.update((current) => {
      const next = new Set(current);
      next.add(assetId);
      return next;
    });
  }

  hasPreviewImage(asset: MediaAsset): boolean {
    return !!asset.file_url && (asset.mime_type?.startsWith('image/') ?? true) && !this.failedImages().has(asset.id);
  }

  formatFileSize(bytes: number | null): string {
    return this.mediaLibraryService.formatFileSize(bytes);
  }

  dimensionsLabel(asset: MediaAsset | null): string {
    if (!asset?.width || !asset.height) {
      return '-';
    }

    return `${asset.width} x ${asset.height}`;
  }

  categoryLabelKey(category: MediaCategory | null): string {
    return `MEDIA_LIBRARY.CATEGORIES.${(category ?? 'general').toUpperCase()}`;
  }

  categoryBadgeClass(category: MediaCategory | null): string {
    switch (category) {
      case 'product':
        return 'bg-[#eef4e8] text-[#5f6f43]';
      case 'promotion':
        return 'bg-[#eaf2ff] text-[#2f6fd0]';
      case 'brand':
        return 'bg-[#fff6e7] text-[#a66309]';
      default:
        return 'bg-[#f0ebe4] text-[#675f55]';
    }
  }

  assetName(asset: MediaAsset | null): string {
    return asset?.title || asset?.original_name || asset?.file_name || '';
  }

  deleteMessage(): string {
    return this.translate.instant('MEDIA_LIBRARY.MODAL.DELETE_MESSAGE', { name: this.assetName(this.deletingAsset()) });
  }

  private toTableRow(asset: MediaAsset): MediaTableRow {
    return {
      id: asset.id,
      raw: asset,
      asset: {
        imageUrl: asset.file_url,
        imageFallbackLabel: 'MEDIA_LIBRARY.IMAGE_FALLBACK',
        title: this.assetName(asset),
        subtitle: asset.original_name ?? asset.file_name,
        initials: this.fileIcon(asset),
      },
      category: {
        labelKey: this.categoryLabelKey(asset.category),
        className: this.categoryBadgeClass(asset.category),
      },
      fileType: asset.file_type ?? '-',
      fileSize: this.formatFileSize(asset.file_size),
      dimensions: this.dimensionsLabel(asset),
      createdAt: this.formatDate(asset.created_at),
      actions: null,
    };
  }

  private resolveAsset(value: MediaAsset | AdminTableRow | null): MediaAsset | null {
    if (!value) {
      return null;
    }

    if ('file_url' in value) {
      return value as MediaAsset;
    }

    const row = value as AdminTableRow & { raw?: MediaAsset };
    return row.raw ?? this.assets().find((asset) => asset.id === row.id) ?? null;
  }

  private fileIcon(asset: MediaAsset): string {
    if (asset.file_type === 'video') {
      return 'pi pi-video';
    }

    if (asset.file_type === 'document') {
      return 'pi pi-file';
    }

    return 'pi pi-image';
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private errorDetail(error: unknown, fallback: string): string {
    if (error instanceof Error) {
      return error.message.startsWith('MEDIA_LIBRARY.') ? this.translate.instant(error.message) : error.message;
    }

    return fallback;
  }
}
