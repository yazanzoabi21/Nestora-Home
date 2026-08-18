export type CustomerSearchResultType = 'product' | 'category' | 'faq' | 'page';

export type CustomerSearchSuggestionType = 'category' | 'brand' | 'search';

export interface CustomerSearchSuggestion {
  readonly id: string;
  readonly label: string;
  readonly type: CustomerSearchSuggestionType;
  readonly value: string;
  readonly icon: string | null;
}

export interface CustomerSearchResultRow {
  readonly id: string;
  readonly result_type: string;
  readonly title: string;
  readonly description: string | null;
  readonly image_url: string | null;
  readonly route: string;
  readonly score: number;
  readonly metadata: unknown;
}

export interface CustomerSearchResult {
  readonly id: string;
  readonly type: CustomerSearchResultType;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly route: string;
  readonly score: number;
  readonly price: number | null;
  readonly originalPrice: number | null;
  readonly category: string | null;
  readonly sku: string | null;
}

export interface CustomerSearchResultGroup {
  readonly type: CustomerSearchResultType;
  readonly labelKey: string;
  readonly results: readonly CustomerSearchResult[];
}
