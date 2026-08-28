import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Params, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { TranslationService } from '../../../../core/services/translation/translation.service';
import { Category } from '../../../../data-access/models';
import {
  CustomerSearchResult,
  CustomerSearchResultGroup,
  CustomerSearchSuggestion,
} from '../../models';
import { CustomerSearchService } from '../../services';

export type CustomerGlobalSearchVariant = 'desktop' | 'mobile';

const SEARCH_DEBOUNCE_MS = 275;
const SUGGESTION_LIMIT = 4;
const PRODUCT_RESULT_LIMIT = 4;
const PRODUCT_IMAGE_FALLBACK = 'assets/images/product-placeholder.png';

@Component({
  selector: 'app-customer-global-search',
  standalone: true,
  imports: [CurrencyPipe, TranslatePipe],
  templateUrl: './customer-global-search.component.html',
  styleUrl: './customer-global-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerGlobalSearchComponent {
  readonly variant = input<CustomerGlobalSearchVariant>('desktop');
  readonly categories = input<readonly Category[]>([]);
  readonly searchFocus = output<void>();

  private readonly searchService = inject(CustomerSearchService);
  private readonly appTranslation = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private requestVersion = 0;

  readonly searchTerm = signal('');
  readonly results = signal<readonly CustomerSearchResult[]>([]);
  readonly loading = signal(false);
  readonly open = signal(false);
  readonly selectedIndex = signal(-1);
  readonly error = signal(false);
  readonly normalizedQuery = computed(() => this.searchService.normalizeQuery(this.searchTerm()));
  readonly inputId = computed(() => `customer-global-search-${this.variant()}`);
  readonly listboxId = computed(() => `${this.inputId()}-results`);
  readonly productResults = computed(() =>
    this.results()
      .filter((result) => result.type === 'product')
      .slice(0, PRODUCT_RESULT_LIMIT),
  );
  readonly groupedResults = computed<readonly CustomerSearchResultGroup[]>(() => {
    const results = this.productResults();
    return results.length
      ? [{ type: 'product', labelKey: 'CUSTOMERS.SEARCH.PRODUCTS', results }]
      : [];
  });
  readonly selectableResults = computed(() => this.productResults());
  readonly activeDescendant = computed(() => {
    const result = this.selectableResults()[this.selectedIndex()];
    return result ? this.resultDomId(result) : null;
  });
  readonly suggestions = computed<readonly CustomerSearchSuggestion[]>(() =>
    [...this.categories()]
      .filter(
        (category) =>
          category.is_active === true &&
          category.name.trim().length > 0 &&
          category.slug.trim().length > 0,
      )
      .sort((first, second) => {
        const firstIsChild = first.parent_id !== null && first.parent_id !== undefined;
        const secondIsChild = second.parent_id !== null && second.parent_id !== undefined;
        return (
          Number(secondIsChild) - Number(firstIsChild) || first.name.localeCompare(second.name)
        );
      })
      .slice(0, SUGGESTION_LIMIT)
      .map((category) => ({
        id: category.id,
        label: category.name,
        type: 'category' as const,
        value: category.slug,
        icon: category.icon?.trim() || null,
      })),
  );
  readonly dropdownVisible = computed(
    () => this.open() && (this.normalizedQuery().length > 0 || this.suggestions().length > 0),
  );

  constructor() {
    effect((onCleanup) => {
      const query = this.normalizedQuery();
      const language = this.appTranslation.currentLang();
      const requestVersion = ++this.requestVersion;
      this.selectedIndex.set(-1);
      this.error.set(false);

      if (query.length < 2) {
        this.results.set([]);
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      const debounceId = window.setTimeout(() => {
        void this.executeSearch(query, language, requestVersion);
      }, SEARCH_DEBOUNCE_MS);
      onCleanup(() => window.clearTimeout(debounceId));
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());
  }

  onInput(value: string): void {
    this.searchTerm.set(value);
    this.open.set(true);
  }

  onFocus(): void {
    this.open.set(true);
    this.searchFocus.emit();
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.results.set([]);
    this.error.set(false);
    this.selectedIndex.set(-1);
  }

  async useSuggestion(suggestion: CustomerSearchSuggestion): Promise<void> {
    const queryParams = this.currentProductsQueryParams();
    queryParams['source'] = 'search';

    switch (suggestion.type) {
      case 'category':
        queryParams['category'] = suggestion.value;
        delete queryParams['brand'];
        delete queryParams['search'];
        break;
      case 'brand':
        queryParams['brand'] = suggestion.value;
        delete queryParams['search'];
        break;
      case 'search':
        queryParams['search'] = suggestion.value;
        break;
    }

    this.clearSearch();
    this.close();
    await this.router.navigate(['/shop/products'], { queryParams });
  }

  retrySearch(): void {
    const query = this.normalizedQuery();
    if (query.length < 2 || this.loading()) return;
    const requestVersion = ++this.requestVersion;
    this.loading.set(true);
    this.error.set(false);
    void this.executeSearch(query, this.appTranslation.currentLang(), requestVersion);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      this.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.selectableResults()[this.selectedIndex()];
      if (selected) {
        void this.navigateToResult(selected);
      } else {
        void this.viewAllResults();
      }
    }
  }

  async navigateToResult(result: CustomerSearchResult): Promise<void> {
    this.close();
    await this.router.navigateByUrl(result.route);
  }

  async viewAllResults(): Promise<void> {
    const query = this.normalizedQuery();
    if (query.length < 2) return;
    this.close();
    await this.router.navigate(['/shop/products'], { queryParams: { search: query } });
  }

  close(): void {
    this.open.set(false);
    this.selectedIndex.set(-1);
  }

  isSelected(result: CustomerSearchResult): boolean {
    const selected = this.selectableResults()[this.selectedIndex()];
    return selected?.id === result.id && selected.type === result.type;
  }

  resultDomId(result: CustomerSearchResult): string {
    return `${this.inputId()}-option-${result.type}-${result.id}`;
  }

  resultIcon(result: CustomerSearchResult): string {
    if (result.type === 'category') return 'pi pi-tag';
    if (result.type === 'faq') return 'pi pi-question-circle';
    return 'pi pi-info-circle';
  }

  useFallbackImage(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement && !image.src.endsWith(PRODUCT_IMAGE_FALLBACK)) {
      image.src = PRODUCT_IMAGE_FALLBACK;
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOnOutsidePointer(event: PointerEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('focusout', ['$event'])
  closeOnFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !this.elementRef.nativeElement.contains(nextTarget)) {
      this.close();
    }
  }

  private async executeSearch(
    query: string,
    language: 'en' | 'ar',
    requestVersion: number,
  ): Promise<void> {
    try {
      const results = await this.searchService.search(query, language);
      if (requestVersion !== this.requestVersion || query !== this.normalizedQuery()) return;
      this.results.set(results);
      this.error.set(false);
    } catch {
      if (requestVersion !== this.requestVersion) return;

      this.results.set([]);
      this.error.set(true);
    } finally {
      if (requestVersion === this.requestVersion) this.loading.set(false);
    }
  }

  private moveSelection(direction: 1 | -1): void {
    const resultCount = this.selectableResults().length;
    if (!resultCount) return;
    const currentIndex = this.selectedIndex();
    this.selectedIndex.set(
      currentIndex < 0
        ? direction === 1
          ? 0
          : resultCount - 1
        : (currentIndex + direction + resultCount) % resultCount,
    );
  }

  private currentProductsQueryParams(): Params {
    const urlTree = this.router.parseUrl(this.router.url);
    const path = urlTree.root.children['primary']?.segments
      .map((segment) => segment.path)
      .join('/');
    return path === 'shop/products' ? { ...urlTree.queryParams } : {};
  }
}
