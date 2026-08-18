import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { TranslationService } from '../../../../core/services/translation/translation.service';
import { CustomerHelpHeaderComponent } from '../../components/customer-help-header/customer-help-header.component';
import { CustomerPageStateComponent } from '../../components/customer-page-state/customer-page-state.component';
import { CustomerContentPage, LocalizedCustomerContentPage } from '../../models';
import { CustomerContentService } from '../../services';

type ContentPageStatus = 'loading' | 'ready' | 'error' | 'not-found';

@Component({
  selector: 'app-customer-content-page',
  standalone: true,
  imports: [CustomerHelpHeaderComponent, CustomerPageStateComponent, TranslatePipe],
  templateUrl: './customer-content-page.component.html',
  styleUrl: './customer-content-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerContentPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly contentService = inject(CustomerContentService);
  private readonly appTranslation = inject(TranslationService);
  private readonly translate = inject(TranslateService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  private readonly page = signal<CustomerContentPage | null>(null);
  readonly status = signal<ContentPageStatus>('loading');
  readonly localizedPage = computed<LocalizedCustomerContentPage | null>(() => {
    const page = this.page();
    if (!page) return null;
    const isArabic = this.appTranslation.currentLang() === 'ar';

    return {
      title: isArabic ? page.titleAr : page.titleEn,
      subtitle: isArabic ? page.subtitleAr : page.subtitleEn,
      content: isArabic ? page.contentAr : page.contentEn,
      metaTitle: (isArabic ? page.metaTitleAr : page.metaTitleEn) || (isArabic ? page.titleAr : page.titleEn),
      metaDescription: isArabic ? page.metaDescriptionAr : page.metaDescriptionEn,
    };
  });

  private readonly slug = this.route.snapshot.data['contentSlug'];

  constructor() {
    effect(() => {
      const localizedPage = this.localizedPage();
      this.appTranslation.currentLang();
      this.title.setTitle(localizedPage?.metaTitle ?? this.translate.instant('CUSTOMERS.HELP.TITLE'));
      this.meta.updateTag({
        name: 'description',
        content: localizedPage?.metaDescription ?? this.translate.instant('CUSTOMERS.HELP.SUBTITLE'),
      });
    });

    void this.load();
  }

  async load(): Promise<void> {
    if (typeof this.slug !== 'string' || !this.slug.trim()) {
      this.status.set('not-found');
      return;
    }

    this.status.set('loading');
    try {
      const page = await this.contentService.getPageBySlug(this.slug);
      this.page.set(page);
      this.status.set(page ? 'ready' : 'not-found');
    } catch (error) {
      console.error('Unable to load customer content page.', error);
      this.status.set('error');
    }
  }
}
