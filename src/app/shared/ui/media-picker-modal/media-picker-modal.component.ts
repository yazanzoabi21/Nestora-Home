import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { MediaAsset, MediaCategory, MediaFileType, MediaLibraryService } from '../../../data-access';
import { AdminFormFieldComponent } from '../admin-form-field';
import { AdminFormModalComponent } from '../admin-form-modal';

interface MediaPickerCategoryOption {
  label: string;
  value: MediaCategory | 'all';
}

@Component({
  selector: 'app-media-picker-modal',
  standalone: true,
  imports: [AdminFormFieldComponent, AdminFormModalComponent, CommonModule, TranslatePipe],
  templateUrl: './media-picker-modal.component.html',
  styleUrl: './media-picker-modal.component.css',
})
export class MediaPickerModalComponent implements OnChanges {
  private readonly mediaLibraryService = inject(MediaLibraryService);

  @Input() isOpen = false;
  @Input() title = 'MEDIA_PICKER.TITLE';
  @Input() categoryFilter: MediaCategory | 'all' = 'all';
  @Input() allowedFileTypes: MediaFileType[] = ['image', 'logo', 'banner', 'avatar'];
  @Input() selectedMediaId: string | null = null;

  // Keep the reusable picker API aligned with the admin modal output naming.
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly selectMedia = new EventEmitter<MediaAsset>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly category = signal<MediaCategory | 'all'>('all');
  readonly media = signal<MediaAsset[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly failedImageIds = signal<Set<string>>(new Set());

  readonly categoryOptions: MediaPickerCategoryOption[] = [
    { label: 'MEDIA_PICKER.FILTER_ALL', value: 'all' },
    { label: 'MEDIA_PICKER.FILTER_PRODUCT', value: 'product' },
    { label: 'MEDIA_PICKER.FILTER_CATEGORY', value: 'category' },
    { label: 'MEDIA_PICKER.FILTER_PROMOTION', value: 'promotion' },
    { label: 'MEDIA_PICKER.FILTER_BRAND', value: 'brand' },
    { label: 'MEDIA_PICKER.FILTER_AVATAR', value: 'avatar' },
  ];

  readonly filteredMedia = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const category = this.category();
    const allowedFileTypes = new Set(this.allowedFileTypes);

    return this.media().filter((asset) => {
      const searchable = [
        asset.file_name,
        asset.original_name ?? '',
        asset.title ?? '',
        asset.alt_text ?? '',
        asset.description ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        asset.is_active !== false &&
        asset.is_deleted !== true &&
        !!asset.file_url &&
        (!asset.file_type || allowedFileTypes.has(asset.file_type)) &&
        (category === 'all' || asset.category === category) &&
        (!searchTerm || searchable.includes(searchTerm))
      );
    });
  });

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['categoryFilter']) {
      this.category.set(this.categoryFilter);
    }

    if (changes['selectedMediaId']) {
      this.selectedId.set(this.selectedMediaId);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.category.set(this.categoryFilter);
      this.selectedId.set(this.selectedMediaId);
      await this.loadMedia();
    }
  }

  async loadMedia(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.media.set(await this.mediaLibraryService.getMediaAssets());
    } catch {
      this.error.set('MEDIA_PICKER.LOAD_FAILED');
    } finally {
      this.loading.set(false);
    }
  }

  select(asset: MediaAsset): void {
    this.selectedId.set(asset.id);
  }

  confirmSelection(): void {
    const selected = this.media().find((asset) => asset.id === this.selectedId());

    if (!selected) {
      return;
    }

    this.selectMedia.emit(selected);
  }

  hasImage(asset: MediaAsset): boolean {
    return !!asset.file_url && !this.failedImageIds().has(asset.id);
  }

  handleImageError(asset: MediaAsset): void {
    this.failedImageIds.update((current) => {
      const next = new Set(current);
      next.add(asset.id);
      return next;
    });
  }

  assetTitle(asset: MediaAsset): string {
    return asset.title?.trim() || asset.original_name?.trim() || asset.file_name;
  }

  assetMeta(asset: MediaAsset): string {
    return [asset.category, this.mediaLibraryService.formatFileSize(asset.file_size)]
      .filter(Boolean)
      .join(' · ');
  }
}
