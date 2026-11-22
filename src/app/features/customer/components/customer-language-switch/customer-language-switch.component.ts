import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupportedLanguage,
  TranslationService,
} from '../../../../core/services/translation';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-customer-language-switch',
  standalone: true,
  imports: [TranslatePipe, NgClass],
  templateUrl: './customer-language-switch.component.html',
  styleUrl: './customer-language-switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLanguageSwitchComponent {
  readonly translation = inject(TranslationService);

  readonly languageSelected = output<SupportedLanguage>();

  async selectLanguage(language: SupportedLanguage): Promise<void> {
    if (await this.translation.useLanguage(language)) {
      this.languageSelected.emit(language);
    }
  }
}
