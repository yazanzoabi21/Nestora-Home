import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupportedLanguage,
  TranslationService,
} from '../../../../core/services/translation';

@Component({
  selector: 'app-customer-language-switch',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-language-switch.component.html',
  styleUrl: './customer-language-switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLanguageSwitchComponent {
  readonly translation = inject(TranslationService);

  selectLanguage(language: SupportedLanguage): void {
    this.translation.useLanguage(language);
  }
}
