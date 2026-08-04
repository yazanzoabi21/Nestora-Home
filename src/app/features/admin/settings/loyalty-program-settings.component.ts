import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ToastService } from '../../../core/services';
import {
  AdminLoyaltyProgramSettings,
  LoyaltyProgramSettingsService,
} from './loyalty-program-settings.service';

const DEFAULT_FORM: AdminLoyaltyProgramSettings = {
  isEnabled: true,
  pointValueUsd: 0.02,
  pointsEarnedPerUsd: 1,
  minimumRedemptionPoints: 400,
  updatedAt: '',
};

@Component({
  selector: 'app-loyalty-program-settings',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './loyalty-program-settings.component.html',
  styleUrl: './loyalty-program-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoyaltyProgramSettingsComponent {
  private readonly settingsService = inject(LoyaltyProgramSettingsService);
  private readonly toast = inject(ToastService);

  readonly form = signal<AdminLoyaltyProgramSettings>({ ...DEFAULT_FORM });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly example = computed(() => {
    const form = this.form();
    return {
      earned: Math.floor(8 * form.pointsEarnedPerUsd),
      cost: form.pointValueUsd > 0 ? Math.ceil(8 / form.pointValueUsd) : 0,
    };
  });

  constructor() {
    void this.load();
  }

  updateBoolean(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.form.update((form) => ({ ...form, isEnabled: input.checked }));
  }

  updateNumber(field: 'pointValueUsd' | 'pointsEarnedPerUsd' | 'minimumRedemptionPoints', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  async save(): Promise<void> {
    const form = this.form();
    if (form.pointValueUsd <= 0 || form.pointsEarnedPerUsd < 0
      || !Number.isInteger(form.minimumRedemptionPoints) || form.minimumRedemptionPoints < 0) {
      this.error.set('LOYALTY_ADMIN.VALIDATION_ERROR');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      this.form.set(await this.settingsService.updateSettings(form));
      this.toast.updated('Loyalty program settings');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save loyalty settings.';
      this.error.set(message);
      this.toast.failed('Loyalty settings update', message);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.form.set(await this.settingsService.getSettings());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load loyalty settings.');
    } finally {
      this.loading.set(false);
    }
  }
}
