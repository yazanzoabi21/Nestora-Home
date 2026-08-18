export interface CustomerSocialLink {
  readonly id: 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';
  readonly labelKey: string;
  readonly url: string;
  readonly iconClass: string;
}

export const CUSTOMER_SOCIAL_LINKS: readonly CustomerSocialLink[] = [
  {
    id: 'whatsapp',
    labelKey: 'CUSTOMERS.FOOTER.SOCIAL.WHATSAPP',
    url: 'https://wa.me/96176557980?text=Hello%20Nestora%20Home%2C%20I%20would%20like%20to%20order.',
    iconClass: 'pi pi-whatsapp',
  },
  {
    id: 'instagram',
    labelKey: 'CUSTOMERS.FOOTER.SOCIAL.INSTAGRAM',
    url: 'https://www.instagram.com/nestoraahome?igsh=MWxlZW81amprOW95bg==',
    iconClass: 'pi pi-instagram',
  },
  {
    id: 'facebook',
    labelKey: 'CUSTOMERS.FOOTER.SOCIAL.FACEBOOK',
    url: 'https://www.facebook.com/profile.php?id=61589435555202&mibextid=ZbWKwL',
    iconClass: 'pi pi-facebook',
  },
  {
    id: 'tiktok',
    labelKey: 'CUSTOMERS.FOOTER.SOCIAL.TIKTOK',
    url: 'https://www.tiktok.com/@nestora.home?_r=1&_t=ZS-98cbpsLW8ft',
    iconClass: 'pi pi-tiktok',
  },
] as const;

export interface CustomerFooterLink {
  readonly labelKey: string;
  readonly route: string;
}

export const CUSTOMER_HELP_LINKS: readonly CustomerFooterLink[] = [
  { labelKey: 'CUSTOMERS.FOOTER.HELP.ABOUT_US', route: '/about-us' },
  { labelKey: 'CUSTOMERS.FOOTER.HELP.CONTACT_US', route: '/contact-us' },
  { labelKey: 'CUSTOMERS.FOOTER.HELP.FAQ', route: '/faq' },
  { labelKey: 'CUSTOMERS.FOOTER.HELP.SHIPPING_POLICY', route: '/shipping-policy' },
  { labelKey: 'CUSTOMERS.FOOTER.HELP.RETURN_POLICY', route: '/return-policy' },
  { labelKey: 'CUSTOMERS.FOOTER.HELP.PRIVACY_POLICY', route: '/privacy-policy' },
] as const;
