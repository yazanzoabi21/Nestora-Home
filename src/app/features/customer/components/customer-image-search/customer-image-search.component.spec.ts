import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { DinoImageEmbeddingService } from '../../../../core/services/dino-image-embedding.service';
import { CustomerImageSearchService, CustomerShoppingStateService } from '../../services';
import { CustomerImageSearchComponent } from './customer-image-search.component';

describe('CustomerImageSearchComponent', () => {
  let fixture: ComponentFixture<CustomerImageSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerImageSearchComponent],
      providers: [
        {
          provide: DinoImageEmbeddingService,
          useValue: {
            state: signal('ready'),
            progress: signal(null),
            prepare: () => undefined,
          },
        },
        { provide: CustomerImageSearchService, useValue: {} },
        { provide: CustomerShoppingStateService, useValue: {} },
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

  afterEach(() => fixture.destroy());

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
