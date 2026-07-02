export type AdminNavigationBadgeKey =
  | 'products.total'
  | 'categories.total'
  | 'inventory.lowStock'
  | 'inventory.outOfStock'
  | 'inventory.stockAlerts'
  | 'discounts.active'
  | 'promotions.active'
  | 'promotions.total'
  | 'reviews.total'
  | 'reviews.pending'
  | 'shipping.activeMethods'
  | 'shipping.disabledMethods'
  | 'shipping.activeZones'
  | 'orders.pending'
  | 'notifications.unread'
  | 'media.total';
  
export interface AdminNavigationItem {
  label: string;
  labelKey: string;
  route: string;
  icon: string;
  badge?: string;
  badgeKey?: AdminNavigationBadgeKey;
}

export interface AdminNavigationSection {
  key: string;
  label: string;
  labelKey: string;
  badgeKey?: AdminNavigationBadgeKey;
  items: AdminNavigationItem[];
}

export const ADMIN_NAVIGATION_SECTIONS: AdminNavigationSection[] = [
  {
    key: 'main',
    label: 'MAIN',
    labelKey: 'SIDEBAR.MAIN',
    items: [
      {
        label: 'Dashboard',
        labelKey: 'SIDEBAR.DASHBOARD',
        route: '/admin/dashboard',
        icon: 'pi pi-th-large',
      },
      {
        label: 'Orders',
        labelKey: 'SIDEBAR.ORDERS',
        route: '/admin/orders',
        icon: 'pi pi-shopping-cart',
      },
      {
        label: 'Products',
        labelKey: 'SIDEBAR.PRODUCTS',
        route: '/admin/products',
        icon: 'pi pi-box',
        badgeKey: 'products.total'
      },
      {
        label: 'Customers',
        labelKey: 'SIDEBAR.CUSTOMERS',
        route: '/admin/customers',
        icon: 'pi pi-users',
      },
      {
        label: 'Analytics',
        labelKey: 'SIDEBAR.ANALYTICS',
        route: '/admin/analytics',
        icon: 'pi pi-chart-bar',
      },
    ],
  },
  {
    key: 'catalogue',
    label: 'CATALOGUE',
    labelKey: 'SIDEBAR.CATALOGUE',
    items: [
      {
        label: 'Categories',
        labelKey: 'SIDEBAR.CATEGORIES',
        route: '/admin/categories',
        icon: 'pi pi-tags',
        badgeKey: 'categories.total',
      },
      {
        label: 'Inventory',
        labelKey: 'SIDEBAR.INVENTORY',
        route: '/admin/inventory',
        icon: 'pi pi-warehouse',
        badgeKey: 'inventory.stockAlerts',
      },
      {
        label: 'Reviews',
        labelKey: 'SIDEBAR.REVIEWS',
        route: '/admin/reviews',
        icon: 'pi pi-star',
        badgeKey: 'reviews.pending',
      },
      {
        label: 'Discounts & Promotions',
        labelKey: 'SIDEBAR.DISCOUNTS_PROMOTIONS',
        route: '/admin/discounts',
        icon: 'pi pi-percentage',
        badgeKey: 'discounts.active',
      },
    ],
  },
  {
    key: 'marketing',
    label: 'MARKETING',
    labelKey: 'SIDEBAR.MARKETING',
    items: [
      {
        label: 'Promotions & Ads',
        labelKey: 'SIDEBAR.PROMOTIONS_ADS',
        route: '/admin/promotions-ads',
        icon: 'pi pi-megaphone',
        badgeKey: 'promotions.total',
      },
    ],
  },
  {
    key: 'operations',
    label: 'OPERATIONS',
    labelKey: 'SIDEBAR.OPERATIONS',
    items: [
      {
        label: 'Payments',
        labelKey: 'SIDEBAR.PAYMENTS',
        route: '/admin/payments',
        icon: 'pi pi-credit-card',
      },
      {
        label: 'Shipping',
        labelKey: 'SIDEBAR.SHIPPING',
        route: '/admin/shipping',
        icon: 'pi pi-truck',
        badgeKey: 'shipping.activeMethods',
      },
    ],
  },
  // {
  //   key: 'people',
  //   label: 'PEOPLE',
  //   labelKey: 'SIDEBAR.PEOPLE',
  //   items: [
  //     {
  //       label: 'Admin Users',
  //       labelKey: 'SIDEBAR.ADMIN_USERS',
  //       route: '/admin/admin-users',
  //       icon: 'pi pi-user-plus',
  //     },
  //   ],
  // },
  {
    key: 'system',
    label: 'SYSTEM',
    labelKey: 'SIDEBAR.SYSTEM',
    items: [
      {
        label: 'Activity Logs',
        labelKey: 'SIDEBAR.ACTIVITY_LOGS',
        route: '/admin/activity-logs',
        icon: 'pi pi-clipboard',
      },
      {
        label: 'Notifications',
        labelKey: 'SIDEBAR.NOTIFICATIONS',
        route: '/admin/notifications',
        icon: 'pi pi-bell',
        badge: '5',
      },
      {
        label: 'Media Library',
        labelKey: 'SIDEBAR.MEDIA_LIBRARY',
        route: '/admin/media-library',
        icon: 'pi pi-image',
        badgeKey: 'media.total',
      },
    ],
  },
  // {
  //   key: 'account',
  //   label: 'ACCOUNT',
  //   labelKey: 'SIDEBAR.ACCOUNT',
  //   items: [
  //     {
  //       label: 'My Profile',
  //       labelKey: 'SIDEBAR.MY_PROFILE',
  //       route: '/admin/profile',
  //       icon: 'pi pi-user',
  //     },
  //     {
  //       label: 'Settings',
  //       labelKey: 'SIDEBAR.SETTINGS',
  //       route: '/admin/profile',
  //       icon: 'pi pi-cog',
  //     },
  //     {
  //       label: 'Help & Support',
  //       labelKey: 'SIDEBAR.HELP_SUPPORT',
  //       route: '/admin/help-support',
  //       icon: 'pi pi-question-circle',
  //     },
  //   ],
  // },
];
