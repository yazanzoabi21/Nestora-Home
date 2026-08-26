import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { TranslationService } from '../../../../core/services/translation/translation.service';
import { CustomerHelpHeaderComponent } from '../../components/customer-help-header/customer-help-header.component';
import { CustomerPageStateComponent } from '../../components/customer-page-state/customer-page-state.component';
import { CustomerFaq, LocalizedCustomerFaq } from '../../models';
import { CustomerContentService } from '../../services';

type FaqStatus = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-customer-faq',
  standalone: true,
  imports: [CustomerHelpHeaderComponent, CustomerPageStateComponent, TranslatePipe],
  templateUrl: './customer-faq.component.html',
  styleUrl: './customer-faq.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFaqComponent {
  private readonly contentService = inject(CustomerContentService);
  private readonly appTranslation = inject(TranslationService);
  private readonly translate = inject(TranslateService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  readonly faqs = signal<readonly CustomerFaq[]>([]);
  readonly status = signal<FaqStatus>('loading');
  readonly selectedCategory = signal('all');
  readonly openFaqId = signal<string | null>(null);
  readonly requestedFaqId = signal<string | null>(null);

  readonly localizedFaqs = computed<readonly LocalizedCustomerFaq[]>(() => {
    const isArabic = this.appTranslation.currentLang() === 'ar';
    return this.faqs().map((faq) => ({
      id: faq.id,
      question: isArabic ? faq.questionAr : faq.questionEn,
      answer: isArabic ? faq.answerAr : faq.answerEn,
      category: faq.category,
    }));
  });

  readonly categories = computed(() => {
    const categories = this.faqs()
      .map((faq) => faq.category)
      .filter((category): category is string => Boolean(category));
    return [...new Set(categories)];
  });

  readonly visibleFaqs = computed(() => {
    const category = this.selectedCategory();
    return category === 'all'
      ? this.localizedFaqs()
      : this.localizedFaqs().filter((faq) => faq.category === category);
  });

  constructor() {
    effect(() => {
      this.appTranslation.currentLang();
      this.title.setTitle(this.translate.instant('CUSTOMERS.FAQ.META_TITLE'));
      this.meta.updateTag({
        name: 'description',
        content: this.translate.instant('CUSTOMERS.FAQ.META_DESCRIPTION'),
      });
    });
    effect(() => {
      const requestedFaqId = this.requestedFaqId();
      if (!requestedFaqId || !this.faqs().some((faq) => faq.id === requestedFaqId)) return;
      this.selectedCategory.set('all');
      this.openFaqId.set(requestedFaqId);
      this.document.defaultView?.setTimeout(() => {
        this.document
          .getElementById(`faq-question-${requestedFaqId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.requestedFaqId.set(params.get('faq'));
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      this.faqs.set(await this.contentService.getFaqs());
      this.status.set('ready');
    } catch (error) {

      this.status.set('error');
    }
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.openFaqId.set(null);
  }

  toggleFaq(id: string): void {
    this.openFaqId.update((openId) => (openId === id ? null : id));
  }

  categoryLabel(category: string): string {
    const key = `CUSTOMERS.FAQ.CATEGORIES.${category.toUpperCase()}`;
    const translated = this.translate.instant(key);
    return translated === key ? category : translated;
  }
}
