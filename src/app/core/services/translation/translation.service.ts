import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';

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
  private languageRequest = 0;

  constructor() {
    this.translate.addLangs(['en', 'ar']);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);
    void this.useLanguage(this.getSavedLanguage());
  }

  useLanguage(language: SupportedLanguage): Promise<boolean> {
    const request = ++this.languageRequest;
    return new Promise((resolve) => {
      this.translate.use(language).pipe(take(1)).subscribe({
        next: () => {
          if (request !== this.languageRequest) {
            resolve(false);
            return;
          }
          this.applyLanguage(language);
          resolve(true);
        },
        error: () => resolve(false),
        complete: () => resolve(false),
      });
    });
  }

  toggleLanguage(): void {
    void this.useLanguage(this.currentLang() === 'en' ? 'ar' : 'en');
  }

  private applyLanguage(language: SupportedLanguage): void {
    this.currentLang.set(language);
    this.updateDocument(language);
    if (this.isBrowser()) {
      try {
        localStorage.setItem(STORAGE_KEY, language);
      } catch {
        // Language switching remains available when browser storage is blocked or full.
      }
    }
  }

  private getSavedLanguage(): SupportedLanguage {
    if (!this.isBrowser()) {
      return DEFAULT_LANGUAGE;
    }

    try {
      const savedLanguage = localStorage.getItem(STORAGE_KEY);
      return savedLanguage === 'ar' ? 'ar' : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  private updateDocument(language: SupportedLanguage): void {
    this.document.documentElement.lang = language;
    this.document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
