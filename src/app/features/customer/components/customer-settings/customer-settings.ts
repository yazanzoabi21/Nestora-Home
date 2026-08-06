import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import {
  CustomerNotificationPreferenceKey,
  CustomerNotificationPreferences,
} from '../../models/customer-notification-preferences.model';
import { CustomerSettingsService } from '../../services/customer-settings.service';

interface NotificationItem {
  key: CustomerNotificationPreferenceKey;
  titleKey: string;
  descriptionKey: string;
  icon: string;
}

@Component({
  selector: 'app-customer-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './customer-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerSettings {
  private readonly settingsService = inject(CustomerSettingsService);

  readonly preferences = signal<CustomerNotificationPreferences | null>(null);
  readonly isLoading = signal(true);
  readonly savingKey = signal<CustomerNotificationPreferenceKey | null>(null);

  readonly isPasswordLoginAvailable = signal(false);
  readonly isUpdatingPassword = signal(false);

  readonly notificationError = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';

  readonly notificationItems: readonly NotificationItem[] = [
    {
      key: 'orderUpdates',
      titleKey: 'CUSTOMER.ACCOUNT.SETTINGS.ORDER_UPDATES',
      descriptionKey: 'CUSTOMER.ACCOUNT.SETTINGS.ORDER_UPDATES_DESCRIPTION',
      icon: 'pi pi-shopping-bag',
    },
    {
      key: 'promotionsAndOffers',
      titleKey: 'CUSTOMER.ACCOUNT.SETTINGS.PROMOTIONS_OFFERS',
      descriptionKey: 'CUSTOMER.ACCOUNT.SETTINGS.PROMOTIONS_OFFERS_DESCRIPTION',
      icon: 'pi pi-tags',
    },
    {
      key: 'weeklyNewsletter',
      titleKey: 'CUSTOMER.ACCOUNT.SETTINGS.WEEKLY_NEWSLETTER',
      descriptionKey: 'CUSTOMER.ACCOUNT.SETTINGS.WEEKLY_NEWSLETTER_DESCRIPTION',
      icon: 'pi pi-envelope',
    },
    {
      key: 'newArrivals',
      titleKey: 'CUSTOMER.ACCOUNT.SETTINGS.NEW_ARRIVALS',
      descriptionKey: 'CUSTOMER.ACCOUNT.SETTINGS.NEW_ARRIVALS_DESCRIPTION',
      icon: 'pi pi-sparkles',
    },
  ];

  constructor() {
    void this.loadSettings();
  }

  async togglePreference(
    key: CustomerNotificationPreferenceKey,
    value: boolean,
  ): Promise<void> {
    const currentPreferences = this.preferences();

    if (!currentPreferences || this.savingKey()) {
      return;
    }

    this.notificationError.set(null);
    this.savingKey.set(key);

    // Update UI immediately
    this.preferences.set({
      ...currentPreferences,
      [key]: value,
    });

    try {
      const updatedPreferences =
        await this.settingsService.updateNotificationPreferences({
          [key]: value,
        });

      this.preferences.set(updatedPreferences);
    } catch (error) {
      // Restore the old value if saving fails
      this.preferences.set(currentPreferences);
      this.notificationError.set(this.getErrorMessage(error));
    } finally {
      this.savingKey.set(null);
    }
  }

  async updatePassword(): Promise<void> {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
      this.passwordError.set('CUSTOMER.ACCOUNT.SETTINGS.PASSWORD_REQUIRED');
      return;
    }

    if (this.newPassword.length < 8) {
      this.passwordError.set('CUSTOMER.ACCOUNT.SETTINGS.PASSWORD_MIN_LENGTH');
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.passwordError.set('CUSTOMER.ACCOUNT.SETTINGS.PASSWORD_MISMATCH');
      return;
    }

    this.isUpdatingPassword.set(true);

    try {
      await this.settingsService.changePassword(
        this.currentPassword,
        this.newPassword,
      );

      this.currentPassword = '';
      this.newPassword = '';
      this.confirmNewPassword = '';
      this.passwordSuccess.set('CUSTOMER.ACCOUNT.SETTINGS.PASSWORD_UPDATED');
    } catch (error) {
      this.passwordError.set(this.getErrorMessage(error));
    } finally {
      this.isUpdatingPassword.set(false);
    }
  }

  isPreferenceEnabled(key: CustomerNotificationPreferenceKey): boolean {
    return this.preferences()?.[key] ?? false;
  }

  private async loadSettings(): Promise<void> {
    this.isLoading.set(true);
    this.notificationError.set(null);

    try {
      const [preferences, passwordLoginAvailable] = await Promise.all([
        this.settingsService.loadNotificationPreferences(),
        this.settingsService.isPasswordLoginAvailable(),
      ]);

      this.preferences.set(preferences);
      this.isPasswordLoginAvailable.set(passwordLoginAvailable);
    } catch (error) {
      this.notificationError.set(this.getErrorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'CUSTOMER.ACCOUNT.SETTINGS.GENERIC_ERROR';
  }
}