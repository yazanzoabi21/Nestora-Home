import { DOCUMENT } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DinoImageEmbeddingService } from '../../../../core/services/dino-image-embedding.service';
import {
  VisualSearchError,
  VisualSearchErrorCode,
} from '../../../../core/models/dino-worker.model';
import {
  resizeImageForEmbedding,
  validateImageSearchFile,
} from '../../../../core/utils/image-embedding.util';
import { CustomerProduct } from '../../models';
import {
  CustomerImageSearchService,
  CustomerImageSearchOverlayService,
  CustomerShoppingStateService,
  isCurrentImageSearchRequest,
} from '../../services';
import { CustomerProductCardComponent } from '../customer-product-card';

@Component({
  selector: 'app-customer-image-search',
  standalone: true,
  imports: [CdkTrapFocus, CustomerProductCardComponent, TranslatePipe],
  templateUrl: './customer-image-search.component.html',
  styleUrl: './customer-image-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerImageSearchComponent implements OnDestroy {
  readonly isOpen = input(false);

  readonly embedding = inject(DinoImageEmbeddingService);
  readonly shopping = inject(CustomerShoppingStateService);
  private readonly searchService = inject(CustomerImageSearchService);
  private readonly overlay = inject(CustomerImageSearchOverlayService);
  private readonly document = inject(DOCUMENT);

  readonly stage = this.overlay.stage;
  readonly previewUrl = this.overlay.previewUrl;
  readonly workingImage = this.overlay.workingImage;
  readonly results = this.overlay.results;
  readonly validationError = this.overlay.validationError;
  readonly searchErrorCode = this.overlay.searchErrorCode;
  readonly dragging = signal(false);
  readonly modelPreparing = computed(
    () => this.embedding.state() === 'loading' || this.embedding.state() === 'idle',
  );
  readonly progress = computed(() => this.embedding.progress());
  readonly noResults = computed(() => this.stage() === 'results' && this.results().length === 0);
  readonly noIndexedProducts = computed(() => this.searchErrorCode() === 'NO_INDEXED_PRODUCTS');

  private requestVersion = 0;
  private scrollValue = '';

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.lockScroll();
        this.embedding.prepare();
      } else {
        this.unlockScroll();
      }
    });
  }

  async selectFiles(files: FileList | readonly File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    const error = validateImageSearchFile(file);
    this.validationError.set(error);
    this.searchErrorCode.set(null);
    if (error) return;

    const selectionVersion = ++this.requestVersion;
    this.overlay.startNewSelection();
    this.stage.set('processing');
    try {
      const resized = await resizeImageForEmbedding(file);
      if (!isCurrentImageSearchRequest(selectionVersion, this.requestVersion, this.isOpen())) return;
      this.workingImage.set(resized);
      this.previewUrl.set(URL.createObjectURL(resized));
      await this.searchSelectedImage(resized, selectionVersion);
    } catch (error: unknown) {
      if (!isCurrentImageSearchRequest(selectionVersion, this.requestVersion, this.isOpen())) return;
      this.logFailure('image-preprocess', 'IMAGE_PREPROCESS_FAILED', error, selectionVersion.toString());
      this.stage.set('error');
      this.searchErrorCode.set('IMAGE_PREPROCESS_FAILED');
    }
  }

  onFileInput(event: Event): void {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement) || !input.files) {
      return;
    }

    const files = Array.from(input.files);
    input.value = '';

    void this.selectFiles(files);
  }

  async findSimilar(): Promise<void> {
    const image = this.workingImage();
    if (!image || this.stage() === 'processing') return;
    const version = ++this.requestVersion;
    this.stage.set('processing');
    this.searchErrorCode.set(null);
    await this.searchSelectedImage(image, version);
  }

  private async searchSelectedImage(image: Blob, version: number): Promise<void> {
    try {
      await this.searchService.assertIndexAvailable();
      if (!isCurrentImageSearchRequest(version, this.requestVersion, this.isOpen())) return;
      const vector = await this.embedding.generateEmbedding(image);
      if (!isCurrentImageSearchRequest(version, this.requestVersion, this.isOpen())) return;
      const products = await this.searchService.search(vector);
      if (!isCurrentImageSearchRequest(version, this.requestVersion, this.isOpen())) return;
      this.results.set(products);
      this.searchErrorCode.set(products.length ? null : 'NO_MATCHES');
      this.stage.set('results');
      this.workingImage.set(null);
    } catch (error: unknown) {
      if (!isCurrentImageSearchRequest(version, this.requestVersion, this.isOpen())) return;
      const visualError = error instanceof VisualSearchError ? error : null;
      this.searchErrorCode.set(visualError?.failure.code ?? 'EMBEDDING_GENERATION_FAILED');
      this.logFailure(
        visualError?.failure.stage ?? 'embedding-generation',
        visualError?.failure.code ?? 'EMBEDDING_GENERATION_FAILED',
        error,
        version.toString(),
        visualError?.failure.runtime,
      );
      this.stage.set('error');
    }
  }

  chooseAnother(): void {
    ++this.requestVersion;
    this.overlay.startNewSelection();
  }

  close(): void {
    ++this.requestVersion;
    this.overlay.dismiss();
  }

  onProductNavigation(): void {
    this.overlay.suspendForProductNavigation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (event.dataTransfer?.files.length) void this.selectFiles(event.dataTransfer.files);
  }

  addToCart(product: CustomerProduct): void {
    void this.shopping.addToCart(product);
  }

  toggleWishlist(product: CustomerProduct): void {
    void this.shopping.toggleWishlist(product);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.isOpen()) this.close();
  }

  ngOnDestroy(): void {
    ++this.requestVersion;
    this.unlockScroll();
  }

  private lockScroll(): void {
    if (this.document.body.dataset['imageSearchLocked'] === 'true') return;
    this.scrollValue = this.document.body.style.overflow;
    this.document.body.dataset['imageSearchLocked'] = 'true';
    this.document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (this.document.body.dataset['imageSearchLocked'] !== 'true') return;
    this.document.body.style.overflow = this.scrollValue;
    delete this.document.body.dataset['imageSearchLocked'];
  }

  private logFailure(
    stage: string,
    code: VisualSearchErrorCode,
    error: unknown,
    requestId: string,
    runtime?: string,
  ): void {
    if (!isDevMode()) return;
    console.error('[VisualSearch] failure', {
      stage,
      code,
      originalError: error,
      requestId,
      runtime: runtime ?? this.embedding.state(),
    });
  }
}
