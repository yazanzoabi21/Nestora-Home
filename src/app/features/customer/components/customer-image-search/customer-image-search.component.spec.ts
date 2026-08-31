import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { CustomerProduct } from '../../models';
import { DinoImageEmbeddingService } from '../../../../core/services/dino-image-embedding.service';
import { CustomerImageSearchService, CustomerShoppingStateService } from '../../services';
import { CustomerImageSearchComponent } from './customer-image-search.component';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function product(id: string): CustomerProduct {
  return {
    id,
    name: `Product ${id}`,
    brand: 'Nestora',
    category: 'Home',
    imageUrl: '/product.webp',
    price: 10,
    rating: 5,
    reviewCount: 1,
    isFeatured: false,
    isNew: false,
    isActive: true,
    isLoyaltyEligible: false,
    soldCount: 0,
    inStock: true,
    stock: 1,
  };
}

describe('CustomerImageSearchComponent', () => {
  let fixture: ComponentFixture<CustomerImageSearchComponent>;
  let assertIndexAvailable: ReturnType<typeof vi.fn>;
  let generateEmbedding: ReturnType<typeof vi.fn>;
  let search: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    assertIndexAvailable = vi.fn().mockResolvedValue(undefined);
    generateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2]);
    search = vi.fn().mockResolvedValue([]);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext(): { drawImage: ReturnType<typeof vi.fn> } {
          return { drawImage: vi.fn() };
        }

        async convertToBlob(): Promise<Blob> {
          return new Blob(['resized'], { type: 'image/jpeg' });
        }
      },
    );
    let previewId = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:preview-${++previewId}`),
      revokeObjectURL: vi.fn(),
    });

    await TestBed.configureTestingModule({
      imports: [CustomerImageSearchComponent],
      providers: [
        {
          provide: DinoImageEmbeddingService,
          useValue: {
            state: signal('ready'),
            progress: signal(null),
            prepare: () => undefined,
            generateEmbedding,
          },
        },
        {
          provide: CustomerImageSearchService,
          useValue: { assertIndexAvailable, search },
        },
        {
          provide: CustomerShoppingStateService,
          useValue: {
            wishlistIds: signal(new Set<string>()),
            wishlistPendingProductIds: signal(new Set<string>()),
            canAdd: () => true,
            addToCart: vi.fn(),
            toggleWishlist: vi.fn(),
          },
        },
        {
          provide: TranslateService,
          useValue: {
            translate: (key: string) => signal(key),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerImageSearchComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  it('automatically starts visual search and renders the scanning state for a valid image', async () => {
    const embedding = deferred<readonly number[]>();
    generateEmbedding.mockReturnValueOnce(embedding.promise);
    const selection = fixture.componentInstance.selectFiles([
      new File(['image'], 'item.jpg', { type: 'image/jpeg' }),
    ]);

    await vi.waitFor(() => expect(generateEmbedding).toHaveBeenCalledTimes(1));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.stage()).toBe('processing');
    expect(element.querySelector('.image-preview-scanning')).not.toBeNull();
    expect(element.textContent).toContain('CUSTOMERS.IMAGE_SEARCH.SCANNING');
    expect(element.textContent).toContain('CUSTOMERS.IMAGE_SEARCH.SCANNING_DETAIL');
    expect(element.textContent).not.toContain('CUSTOMERS.IMAGE_SEARCH.FIND');
    expect(assertIndexAvailable).toHaveBeenCalledTimes(1);

    embedding.resolve([0.1, 0.2]);
    await selection;
  });

  it('does not render a Find Similar Products button', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    );

    expect(
      buttons.some((button) => button.textContent?.includes('CUSTOMERS.IMAGE_SEARCH.FIND')),
    ).toBe(false);
  });

  it('automatically starts a new search whenever another valid image is selected', async () => {
    await fixture.componentInstance.selectFiles([
      new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
    ]);
    await fixture.componentInstance.selectFiles([
      new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
    ]);

    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(generateEmbedding).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('does not let an older search response replace newer results', async () => {
    const olderResponse = deferred<readonly CustomerProduct[]>();
    const newerProduct = product('newer');
    search.mockReturnValueOnce(olderResponse.promise).mockResolvedValueOnce([newerProduct]);

    const olderSelection = fixture.componentInstance.selectFiles([
      new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
    ]);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));

    await fixture.componentInstance.selectFiles([
      new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
    ]);
    expect(fixture.componentInstance.results()).toEqual([newerProduct]);

    olderResponse.resolve([product('older')]);
    await olderSelection;

    expect(fixture.componentInstance.results()).toEqual([newerProduct]);
    expect(fixture.componentInstance.stage()).toBe('results');
  });

  it('uses a compact query-image row when the search is complete', async () => {
    await fixture.componentInstance.selectFiles([
      new File(['image'], 'item.jpg', { type: 'image/jpeg' }),
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const resultsLayout = element.querySelector('.image-search-content--results');

    expect(resultsLayout).not.toBeNull();
    expect(resultsLayout?.querySelector('.image-search-query .image-preview-shell')).not.toBeNull();
    expect(resultsLayout?.querySelector('.image-search-replace')).not.toBeNull();
  });

  it('opens the native picker from the visible upload button', () => {
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('#customer-visual-search-upload');
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes('CUSTOMERS.IMAGE_SEARCH.UPLOAD'),
    );
    const showPicker = vi.fn();

    expect(input).not.toBeNull();
    if (!input) throw new Error('Expected the visual-search upload input to render.');

    Object.defineProperty(input, 'showPicker', { configurable: true, value: showPicker });

    expect(input?.type).toBe('file');
    expect(input?.accept).toBe('image/jpeg,image/png,image/webp');
    expect(input?.hasAttribute('capture')).toBe(false);
    expect(button).toBeDefined();

    button?.click();

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('resets the native input so selecting the same file can emit change again', () => {
    const input = fixture.nativeElement.querySelector(
      'input[type="file"][accept="image/jpeg,image/png,image/webp"]',
    ) as HTMLInputElement;
    const file = new File(['image'], 'item.jpg', { type: 'image/jpeg' });
    const files = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    const selectFiles = vi.spyOn(fixture.componentInstance, 'selectFiles').mockResolvedValue();

    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('change'));

    expect(selectFiles).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('');
  });

  it('keeps mobile camera capture on its own native input', () => {
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('#customer-visual-search-camera');
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes('CUSTOMERS.IMAGE_SEARCH.TAKE_PHOTO'),
    );
    const showPicker = vi.fn();

    expect(input).not.toBeNull();
    if (!input) throw new Error('Expected the visual-search camera input to render.');

    Object.defineProperty(input, 'showPicker', { configurable: true, value: showPicker });

    expect(input?.type).toBe('file');
    expect(input?.accept).toBe('image/*');
    expect(input?.getAttribute('capture')).toBe('environment');
    expect(button?.classList.contains('sm:hidden')).toBe(true);

    button?.click();

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('prevents the browser default and sends dropped files through the shared selection flow', () => {
    const file = new File(['image'], 'item.webp', { type: 'image/webp' });
    const files = [file] as unknown as FileList;
    const preventDefault = vi.fn();
    const selectFiles = vi.spyOn(fixture.componentInstance, 'selectFiles').mockResolvedValue();

    fixture.componentInstance.onDrop({
      preventDefault,
      dataTransfer: { files },
    } as unknown as DragEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selectFiles).toHaveBeenCalledWith(files);
  });
});
