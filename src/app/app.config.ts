import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import type { TranslationObject } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, map, shareReplay } from 'rxjs';

import { routes } from './app.routes';

type TranslationFile = Record<string, TranslationObject>;

class SingleFileTranslateLoader implements TranslateLoader {
  private readonly translations: Observable<TranslationFile>;

  constructor(http: HttpClient) {
    this.translations = http
      .get<TranslationFile>('./assets/i18n/translations.json')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  getTranslation(lang: string): Observable<TranslationObject> {
    return this.translations.pipe(
      map((translations) => {
        return translations[lang] ?? translations['en'] ?? {};
      }),
    );
  }
}

export function createTranslateLoader(http: HttpClient): TranslateLoader {
  return new SingleFileTranslateLoader(http);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    MessageService,

    provideTranslateService({
      lang: 'en',
      fallbackLang: 'en',
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient],
      },
    }),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
