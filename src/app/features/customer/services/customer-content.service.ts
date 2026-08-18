import { Injectable, inject } from '@angular/core';

import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
  CustomerContactMessageInput,
  CustomerContentPage,
  CustomerContentPageRow,
  CustomerContentSection,
  CustomerFaq,
  CustomerFaqRow,
} from '../models';

const CONTENT_PAGE_SELECT = `
  id,
  slug,
  page_type,
  title_en,
  title_ar,
  subtitle_en,
  subtitle_ar,
  content_en,
  content_ar,
  meta_title_en,
  meta_title_ar,
  meta_description_en,
  meta_description_ar,
  sort_order,
  is_active,
  is_published,
  created_at,
  updated_at
`;

const FAQ_SELECT = `
  id,
  question_en,
  question_ar,
  answer_en,
  answer_ar,
  category,
  sort_order,
  is_active,
  created_at,
  updated_at
`;

@Injectable({ providedIn: 'root' })
export class CustomerContentService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  private readonly pageCache = new Map<string, CustomerContentPage | null>();
  private faqCache: readonly CustomerFaq[] | null = null;

  async getPageBySlug(slug: string): Promise<CustomerContentPage | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (this.pageCache.has(normalizedSlug)) {
      return this.pageCache.get(normalizedSlug) ?? null;
    }

    const { data, error } = await this.supabase
      .from('customer_content_pages')
      .select(CONTENT_PAGE_SELECT)
      .eq('slug', normalizedSlug)
      .eq('is_active', true)
      .eq('is_published', true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const page = data ? this.mapPage(data as CustomerContentPageRow) : null;
    this.pageCache.set(normalizedSlug, page);
    return page;
  }

  async getFaqs(): Promise<readonly CustomerFaq[]> {
    if (this.faqCache) return this.faqCache;

    const { data, error } = await this.supabase
      .from('customer_faqs')
      .select(FAQ_SELECT)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    this.faqCache = (data as CustomerFaqRow[]).map((row) => this.mapFaq(row));
    return this.faqCache;
  }

  async submitContactMessage(input: CustomerContactMessageInput): Promise<void> {
    const customerUserId = await this.auth.getCurrentUserId();
    const { error } = await this.supabase.from('customer_contact_messages').insert({
      customer_user_id: customerUserId,
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      subject: input.subject.trim(),
      message: input.message.trim(),
      status: 'new',
    });

    if (error) throw new Error(error.message);
  }

  private mapPage(row: CustomerContentPageRow): CustomerContentPage {
    return {
      id: row.id,
      slug: row.slug,
      pageType: row.page_type,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      subtitleEn: row.subtitle_en,
      subtitleAr: row.subtitle_ar,
      contentEn: this.parseSections(row.content_en),
      contentAr: this.parseSections(row.content_ar),
      metaTitleEn: row.meta_title_en,
      metaTitleAr: row.meta_title_ar,
      metaDescriptionEn: row.meta_description_en,
      metaDescriptionAr: row.meta_description_ar,
    };
  }

  private mapFaq(row: CustomerFaqRow): CustomerFaq {
    return {
      id: row.id,
      questionEn: row.question_en,
      questionAr: row.question_ar,
      answerEn: row.answer_en,
      answerAr: row.answer_ar,
      category: row.category,
    };
  }

  private parseSections(value: unknown): readonly CustomerContentSection[] {
    if (!Array.isArray(value)) throw new Error('Customer content must be an array.');

    return value.map((section) => {
      if (!this.isRecord(section)) throw new Error('Invalid customer content section.');
      const type = section['type'];
      const title = this.requiredString(section['title']);

      if (type === 'list') {
        const items = section['items'];
        if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) {
          throw new Error('Invalid customer content list.');
        }
        return { type, title, items };
      }

      if (type === 'text' || type === 'notice') {
        return { type, title, body: this.requiredString(section['body']) };
      }

      throw new Error('Unsupported customer content section type.');
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private requiredString(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('Invalid customer content text.');
    }
    return value;
  }
}
