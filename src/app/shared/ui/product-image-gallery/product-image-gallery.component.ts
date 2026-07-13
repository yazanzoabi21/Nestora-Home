import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface ProductImageItem {
  id: string;
  url: string;
  name: string;
  file?: File;
  mediaId?: string;
}

@Component({
  selector: 'app-product-image-gallery',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './product-image-gallery.component.html',
  styleUrl: './product-image-gallery.component.css',
})
export class ProductImageGalleryComponent {
  @Input() images: ProductImageItem[] = [];
  @Input() coverId: string | null = null;
  @Input() error: string | null = null;
  @Input() disabled = false;

  @Output() readonly filesSelected = new EventEmitter<File[]>();
  @Output() readonly removeImage = new EventEmitter<string>();
  @Output() readonly setCover = new EventEmitter<string>();
  @Output() readonly moveImage = new EventEmitter<{ id: string; direction: -1 | 1 }>();
  @Output() readonly chooseMedia = new EventEmitter<void>();

  readonly previewId = signal<string | null>(null);

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.filesSelected.emit(Array.from(input.files ?? []));
    input.value = '';
  }

  showPreview(id: string): void {
    this.previewId.set(id);
  }
  hidePreview(id: string): void {
    if (this.previewId() === id) this.previewId.set(null);
  }
  togglePreview(id: string): void {
    this.previewId.update((current) => (current === id ? null : id));
  }

  previewImage(): ProductImageItem | null {
    return this.images.find((image) => image.id === this.previewId()) ?? null;
  }
}
