export interface CustomerNotificationPreferences {
    customerId: string;
    orderUpdates: boolean;
    promotionsAndOffers: boolean;
    weeklyNewsletter: boolean;
    newArrivals: boolean;
}

export interface UpdateCustomerNotificationPreferences {
    orderUpdates?: boolean;
    promotionsAndOffers?: boolean;
    weeklyNewsletter?: boolean;
    newArrivals?: boolean;
}

export type CustomerNotificationPreferenceKey =
    keyof UpdateCustomerNotificationPreferences;