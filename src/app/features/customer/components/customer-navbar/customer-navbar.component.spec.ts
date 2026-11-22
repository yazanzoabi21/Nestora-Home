import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateLoader, TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import translations from '../../../../../assets/i18n/translations.json';
import { CustomerAuthService } from '../../../../core/services/auth';
import type { LogoutResult } from '../../../../core/services/auth/auth-session-lifecycle';
import { ToastService } from '../../../../core/services/toast.service';
import { TranslationService } from '../../../../core/services/translation';
import { Category } from '../../../../data-access/models';
import { CategoriesService } from '../../../../data-access/services';
import { CustomerPromotionAnnouncement, CustomerPromotionalBarService, CustomerShoppingStateService } from '../../services';
import { CustomerGlobalSearchComponent } from '../customer-global-search/customer-global-search.component';
import { CustomerNavbarComponent } from './customer-navbar.component';

async function renderNavbar() {
  const categories: Category[] = [
    { id: '1', parent_id: 'parent', slug: 'kitchen-essentials', name: 'Kitchen Essentials', name_ar: 'مستلزمات المطبخ', is_active: true },
    { id: '2', parent_id: 'parent', slug: 'brand', name: 'Brand Name', is_active: true },
    { id: '3', parent_id: 'parent', slug: 'custom', name: 'Custom Name', name_ar: 'اسم مخصص', is_active: true },
  ];
  const promotions: CustomerPromotionAnnouncement[] = [{
    id: 'promotion', source: 'promotion', title: 'Rewards', message: 'Sign in to earn points',
    link: '/auth/customer-login', linkText: 'Sign in',
    arabic: { title: 'المكافآت', message: 'سجّل الدخول لكسب النقاط', linkText: 'تسجيل الدخول' },
  }];
  const discounts: CustomerPromotionAnnouncement[] = [{
    id: 'discount', source: 'discount', title: '', badgeText: 'SAVE100',
    discount: { type: 'free_gift', value: '$0', code: 'SAVE100', minimumOrder: '$100' },
  }];
  const getPublicCategories = vi.fn(async () => categories);
  const getActivePromotionAnnouncements = vi.fn(async () => promotions);
  const getActiveDiscountAnnouncements = vi.fn(async () => discounts);
  const authenticated = signal(false);
  const logout = vi.fn<() => Promise<LogoutResult>>();
  const toast = { warn: vi.fn(), error: vi.fn() };

  TestBed.configureTestingModule({
    imports: [CustomerNavbarComponent],
    providers: [
      provideRouter([]), provideTranslateService(),
      { provide: CategoriesService, useValue: { getPublicCategories } },
      { provide: CustomerPromotionalBarService, useValue: { getActivePromotionAnnouncements, getActiveDiscountAnnouncements } },
      { provide: CustomerShoppingStateService, useValue: { cartQuantity: () => 0, wishlistCount: () => 0 } },
      { provide: ToastService, useValue: toast },
      { provide: CustomerAuthService, useValue: {
        isAuthenticated: authenticated, isLoading: () => false, customerProfile: () => null, initials: () => 'NH', logout,
      } },
    ],
  }).overrideComponent(CustomerNavbarComponent, {
    remove: { imports: [CustomerGlobalSearchComponent] },
    add: { schemas: [NO_ERRORS_SCHEMA] },
  });

  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en', translations.en);
  translate.setTranslation('ar', translations.ar);
  const language = TestBed.inject(TranslationService);
  language.useLanguage('en');

  const fixture = TestBed.createComponent(CustomerNavbarComponent);
  fixture.componentInstance.pauseAnnouncementCarousel();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.componentInstance.announcementsLoading()).toBe(false);
  });
  const element: HTMLElement = fixture.nativeElement;
  const menu = () => element.querySelector('#customer-mobile-menu');
  const menuTrigger = element.querySelector<HTMLButtonElement>('[aria-controls="customer-mobile-menu"]')!;
  const openMenu = () => { menuTrigger.click(); fixture.detectChanges(); };
  const expandCategories = () => {
    menu()?.querySelector<HTMLButtonElement>('[aria-controls="customer-mobile-categories"]')?.click();
    fixture.detectChanges();
  };
  const chooseLanguage = (lang: string) => {
    menu()?.querySelector<HTMLButtonElement>('button[lang="' + lang + '"]')?.click();
  };
  const logoutButton = () => menu()?.querySelector<HTMLButtonElement>('.pi-sign-out')?.closest('button');
  return { fixture, element, language, translate, authenticated, logout, toast, menu, menuTrigger, openMenu, expandCategories, chooseLanguage, logoutButton,
    getPublicCategories, getActivePromotionAnnouncements, getActiveDiscountAnnouncements };
}

describe('CustomerNavbarComponent', () => {
  afterEach(() => {
    localStorage.removeItem('nestora-language');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('switches navigation, category and offer copy without reloading the data', async () => {
    const { fixture, element, language, menu, openMenu, expandCategories, authenticated,
      getPublicCategories, getActivePromotionAnnouncements, getActiveDiscountAnnouncements } = await renderNavbar();
    openMenu();
    expandCategories();
    const discount = () => element.querySelector('.discount-bar')?.textContent;
    expect(menu()?.textContent).toContain('My Account');
    expect(menu()?.textContent).toContain('Wishlist');
    expect(menu()?.textContent).toContain('Kitchen Essentials');
    expect(menu()?.querySelector('a[href="/auth/customer-login"]')).toBeTruthy();
    expect(discount()).toContain('Free gift');
    expect(element.querySelector('.announcement-bar')?.textContent).toContain('Sign in to earn points');

    authenticated.set(true);
    language.useLanguage('ar');
    fixture.detectChanges();
    expect(document.documentElement.dir).toBe('rtl');
    expect(menu()?.textContent).toContain('حسابي');
    expect(menu()?.textContent).toContain('المفضلة');
    expect(menu()?.textContent).toContain('مستلزمات المطبخ');
    expect(menu()?.textContent).toContain('اسم مخصص');
    expect(menu()?.textContent).toContain('Brand Name');
    expect(menu()?.querySelector('a[href="/shop/customer-account"]')).toBeTruthy();
    expect(discount()).toContain('هدية مجانية');
    expect(discount()).toContain('SAVE100');
    expect(discount()).toContain('$100');
    expect(element.querySelector('.announcement-bar')?.textContent).toContain('سجّل الدخول لكسب النقاط');

    language.useLanguage('en');
    fixture.detectChanges();
    expect(document.documentElement.dir).toBe('ltr');
    expect(menu()?.textContent).toContain('Kitchen Essentials');
    expect(getPublicCategories).toHaveBeenCalledTimes(1);
    expect(getActivePromotionAnnouncements).toHaveBeenCalledTimes(1);
    expect(getActiveDiscountAnnouncements).toHaveBeenCalledTimes(1);
  });
  it('closes the drawer for either language and an already active language without navigating', async () => {
    const { fixture, menu, menuTrigger, openMenu, expandCategories, chooseLanguage } = await renderNavbar();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');

    for (const lang of ['ar', 'en', 'en']) {
      openMenu();
      expandCategories();
      expect(menu()?.querySelector('#customer-mobile-categories')).toBeTruthy();
      chooseLanguage(lang);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(menu()).toBeNull();
      });
      expect(document.activeElement).toBe(menuTrigger);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      expect(localStorage.getItem('nestora-language')).toBe(lang);
      expect(fixture.componentInstance.mobileCategoriesMenuOpen()).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps the menu open while a language loads and ignores a superseded change', async () => {
    const { fixture, menu, openMenu, chooseLanguage, language, translate } = await renderNavbar();
    const arabic = new Subject<TranslationObject>();
    vi.spyOn(TestBed.inject(TranslateLoader), 'getTranslation').mockReturnValue(arabic);
    translate.resetLang('ar');
    openMenu();

    chooseLanguage('ar');
    await fixture.whenStable();
    expect(menu()).not.toBeNull();
    expect(language.currentLang()).toBe('en');

    chooseLanguage('en');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(menu()).toBeNull();
    });
    arabic.next(translations.ar);
    arabic.complete();
    await fixture.whenStable();
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('nestora-language')).toBe('en');
  });

  it('shows a localized logout only when authenticated and signs out once', async () => {
    const { fixture, language, authenticated, logout, openMenu, logoutButton, menu } = await renderNavbar();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    openMenu();

    for (const lang of ['en', 'ar'] as const) {
      await language.useLanguage(lang);
      fixture.detectChanges();
      expect(logoutButton()).toBeUndefined();
      authenticated.set(true);
      fixture.detectChanges();
      expect(logoutButton()?.textContent?.trim()).toBe(translations[lang].CUSTOMER.ACCOUNT.LOGOUT);
      authenticated.set(false);
    }

    authenticated.set(true);
    fixture.detectChanges();
    let completeLogout!: (result: LogoutResult) => void;
    logout.mockImplementation(() => new Promise(resolve => { completeLogout = resolve; }));
    const button = logoutButton()!;
    button.click();
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(logout).toHaveBeenCalledExactlyOnceWith(false);
    expect(menu()).not.toBeNull();
    authenticated.set(false);
    completeLogout({ localSessionCleared: true, remoteRevocationConfirmed: true });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(menu()).toBeNull();
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/shop'], { replaceUrl: true });
    openMenu();
    expect(logoutButton()).toBeUndefined();
  });

  it('shows existing warnings and errors without pretending the local sign-out succeeded', async () => {
    const { fixture, authenticated, language, logout, toast, openMenu, logoutButton, menu } = await renderNavbar();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await language.useLanguage('ar');
    authenticated.set(true);
    openMenu();
    logout.mockResolvedValueOnce({ localSessionCleared: false, remoteRevocationConfirmed: false });
    logoutButton()?.click();
    await vi.waitFor(() => expect(toast.warn).toHaveBeenCalledWith(translations.ar.AUTH.ERRORS.LOGOUT_LOCAL_FAILED));
    fixture.detectChanges();
    expect(menu()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    logout.mockRejectedValueOnce(new Error('Offline'));
    logoutButton()?.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(translations.ar.AUTH.ERRORS.LOGOUT_LOCAL_FAILED));
    fixture.detectChanges();
    expect(logoutButton()?.disabled).toBe(false);

    logout.mockImplementationOnce(async () => {
      authenticated.set(false);
      return { localSessionCleared: true, remoteRevocationConfirmed: false };
    });
    logoutButton()?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(menu()).toBeNull();
    });
    expect(toast.warn).toHaveBeenLastCalledWith(translations.ar.AUTH.ERRORS.LOGOUT_UNCONFIRMED);
  });
});
