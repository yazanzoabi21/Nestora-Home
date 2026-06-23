import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type SupportedLanguage = 'en' | 'ar';

const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
const STORAGE_KEY = 'nestora-language';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  readonly currentLang = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);

  constructor() {
    this.translate.addLangs(['en', 'ar']);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);
    this.useLanguage(this.getSavedLanguage());
  }

  useLanguage(language: SupportedLanguage): void {
    this.currentLang.set(language);
    this.translate.use(language);
    this.updateDocument(language);

    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEY, language);
    }
  }

  toggleLanguage(): void {
    this.useLanguage(this.currentLang() === 'en' ? 'ar' : 'en');
  }

  private getSavedLanguage(): SupportedLanguage {
    if (!this.isBrowser()) {
      return DEFAULT_LANGUAGE;
    }

    const savedLanguage = localStorage.getItem(STORAGE_KEY);
    return savedLanguage === 'ar' ? 'ar' : DEFAULT_LANGUAGE;
  }

  private updateDocument(language: SupportedLanguage): void {
    this.document.documentElement.lang = language;
    this.document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
