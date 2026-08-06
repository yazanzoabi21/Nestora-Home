import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
    CustomerNotificationPreferences,
    UpdateCustomerNotificationPreferences
} from '../models/customer-notification-preferences.model';

interface CustomerNotificationPreferencesRow {
    customer_id: string;
    order_updates: boolean;
    promotions_and_offers: boolean;
    weekly_newsletter: boolean;
    new_arrivals: boolean;
}

@Injectable({
    providedIn: 'root',
})
export class CustomerSettingsService {
    private readonly supabase = inject(CUSTOMER_SUPABASE);

    async loadNotificationPreferences(): Promise<CustomerNotificationPreferences> {
        const customerId = await this.getCustomerId();

        const { data, error } = await this.supabase
            .from('customer_notification_preferences')
            .select(`
        customer_id,
        order_updates,
        promotions_and_offers,
        weekly_newsletter,
        new_arrivals
      `)
            .eq('customer_id', customerId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        if (data) {
            return this.mapPreferences(data);
        }

        return this.createDefaultNotificationPreferences(customerId);
    }

    async updateNotificationPreferences(
        changes: UpdateCustomerNotificationPreferences,
    ): Promise<CustomerNotificationPreferences> {
        const customerId = await this.getCustomerId();

        const { data, error } = await this.supabase
            .from('customer_notification_preferences')
            .upsert(
                {
                    customer_id: customerId,
                    ...this.mapPreferenceChanges(changes),
                },
                {
                    onConflict: 'customer_id',
                },
            )
            .select(`
        customer_id,
        order_updates,
        promotions_and_offers,
        weekly_newsletter,
        new_arrivals
      `)
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return this.mapPreferences(data);
    }

    async changePassword(
        currentPassword: string,
        newPassword: string,
    ): Promise<void> {
        const {
            data: { user },
            error: userError,
        } = await this.supabase.auth.getUser();

        if (userError || !user?.email) {
            throw new Error('Unable to identify the current customer.');
        }

        const { error: signInError } = await this.supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });

        if (signInError) {
            throw new Error('Your current password is incorrect.');
        }

        const { error: updateError } = await this.supabase.auth.updateUser({
            password: newPassword,
        });

        if (updateError) {
            throw new Error(updateError.message);
        }
    }

    async isPasswordLoginAvailable(): Promise<boolean> {
        const {
            data: { user },
        } = await this.supabase.auth.getUser();

        if (!user) {
            return false;
        }

        return user.app_metadata?.['provider'] === 'email';
    }

    private async createDefaultNotificationPreferences(
        customerId: string,
    ): Promise<CustomerNotificationPreferences> {
        const { data, error } = await this.supabase
            .from('customer_notification_preferences')
            .insert({
                customer_id: customerId,
                order_updates: true,
                promotions_and_offers: true,
                weekly_newsletter: false,
                new_arrivals: true,
            })
            .select(`
        customer_id,
        order_updates,
        promotions_and_offers,
        weekly_newsletter,
        new_arrivals
      `)
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return this.mapPreferences(data);
    }

    private async getCustomerId(): Promise<string> {
        const {
            data: { user },
            error,
        } = await this.supabase.auth.getUser();

        if (error || !user) {
            throw new Error('You need to sign in to manage your settings.');
        }

        return user.id;
    }

    private mapPreferences(
        row: CustomerNotificationPreferencesRow,
    ): CustomerNotificationPreferences {
        return {
            customerId: row.customer_id,
            orderUpdates: row.order_updates,
            promotionsAndOffers: row.promotions_and_offers,
            weeklyNewsletter: row.weekly_newsletter,
            newArrivals: row.new_arrivals,
        };
    }

    private mapPreferenceChanges(
        changes: UpdateCustomerNotificationPreferences,
    ): Record<string, boolean> {
        const payload: Record<string, boolean> = {};

        if (changes.orderUpdates !== undefined) {
            payload['order_updates'] = changes.orderUpdates;
        }

        if (changes.promotionsAndOffers !== undefined) {
            payload['promotions_and_offers'] = changes.promotionsAndOffers;
        }

        if (changes.weeklyNewsletter !== undefined) {
            payload['weekly_newsletter'] = changes.weeklyNewsletter;
        }

        if (changes.newArrivals !== undefined) {
            payload['new_arrivals'] = changes.newArrivals;
        }

        return payload;
    }
}