import { CustomerContentSection } from './customer-content-section.model';

export interface CustomerContentPageRow {
  readonly id: string;
  readonly slug: string;
  readonly page_type: string;
  readonly title_en: string;
  readonly title_ar: string;
  readonly subtitle_en: string | null;
  readonly subtitle_ar: string | null;
  readonly content_en: unknown;
  readonly content_ar: unknown;
  readonly meta_title_en: string | null;
  readonly meta_title_ar: string | null;
  readonly meta_description_en: string | null;
  readonly meta_description_ar: string | null;
  readonly sort_order: number;
  readonly is_active: boolean;
  readonly is_published: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CustomerContentPage {
  readonly id: string;
  readonly slug: string;
  readonly pageType: string;
  readonly titleEn: string;
  readonly titleAr: string;
  readonly subtitleEn: string | null;
  readonly subtitleAr: string | null;
  readonly contentEn: readonly CustomerContentSection[];
  readonly contentAr: readonly CustomerContentSection[];
  readonly metaTitleEn: string | null;
  readonly metaTitleAr: string | null;
  readonly metaDescriptionEn: string | null;
  readonly metaDescriptionAr: string | null;
}

export interface LocalizedCustomerContentPage {
  readonly title: string;
  readonly subtitle: string | null;
  readonly content: readonly CustomerContentSection[];
  readonly metaTitle: string;
  readonly metaDescription: string | null;
}
