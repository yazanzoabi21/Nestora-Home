import { Injectable } from '@angular/core';

import { ADMIN_NAVIGATION_SECTIONS } from './admin-navigation.config';

export interface AdminSearchResult {
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  type: 'page' | 'action' | 'search';
  queryParam?: boolean;
  keywords: string[];
}

interface AdminSearchPage {
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  keywords: string[];
  searchable: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AdminGlobalSearchService {
  private readonly pages: AdminSearchPage[] = ADMIN_NAVIGATION_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => item.route.startsWith('/admin/'))
      .map((item) => ({
        title: item.label,
        subtitle: section.label,
        icon: item.icon,
        route: item.route,
        keywords: this.keywordsFor(item.label, item.route, section.label),
        searchable: SEARCHABLE_ADMIN_ROUTES.has(item.route),
      }))
  );

  private readonly actions: AdminSearchResult[] = [
    {
      title: 'Add product',
      subtitle: 'Open products to create and manage products',
      icon: 'pi pi-plus-circle',
      route: '/admin/products',
      type: 'action',
      keywords: ['add', 'create', 'new', 'product', 'products', 'catalogue'],
    },
    {
      title: 'Review orders',
      subtitle: 'Open orders to review customer purchases',
      icon: 'pi pi-shopping-cart',
      route: '/admin/orders',
      type: 'action',
      keywords: ['review', 'orders', 'sales', 'purchases', 'customers'],
    },
    {
      title: 'Manage payment methods',
      subtitle: 'Open payments to manage payment methods',
      icon: 'pi pi-credit-card',
      route: '/admin/payments',
      type: 'action',
      keywords: ['payment', 'payments', 'method', 'methods', 'cash', 'cod', 'wallet'],
    },
    {
      title: 'Manage shipping',
      subtitle: 'Open shipping methods and delivery zones',
      icon: 'pi pi-truck',
      route: '/admin/shipping',
      type: 'action',
      keywords: ['shipping', 'delivery', 'zones', 'methods', 'carrier'],
    },
    {
      title: 'Upload media',
      subtitle: 'Open the media library',
      icon: 'pi pi-upload',
      route: '/admin/media-library',
      type: 'action',
      keywords: ['upload', 'media', 'image', 'images', 'library'],
    },
  ];

  search(query: string): AdminSearchResult[] {
    const normalizedQuery = this.normalize(query);

    if (!normalizedQuery) {
      return this.pages.slice(0, 6).map((page) => this.toPageResult(page));
    }

    const pageResults = this.pages
      .map((page) => ({ page, score: this.score(page, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ page }) => this.toPageResult(page));

    const actionResults = this.actions
      .map((action) => ({ action, score: this.score(action, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ action }) => action);

    const searchResults = this.pages
      .filter((page) => page.searchable)
      .map((page) => ({
        ...this.toSearchResult(page, query.trim()),
        score: this.score(page, normalizedQuery),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score: _score, ...result }) => result);

    return [...pageResults.slice(0, 4), ...actionResults.slice(0, 3), ...searchResults].slice(0, 10);
  }

  private toPageResult(page: AdminSearchPage): AdminSearchResult {
    return {
      title: page.title,
      subtitle: page.subtitle,
      icon: page.icon,
      route: page.route,
      type: 'page',
      keywords: page.keywords,
    };
  }

  private toSearchResult(page: AdminSearchPage, query: string): AdminSearchResult {
    return {
      title: `Search ${page.title.toLowerCase()} for "${query}"`,
      subtitle: `Apply this query inside ${page.title}`,
      icon: page.icon,
      route: page.route,
      type: 'search',
      queryParam: true,
      keywords: page.keywords,
    };
  }

  private score(result: Pick<AdminSearchResult, 'title' | 'subtitle' | 'keywords'>, query: string): number {
    const title = this.normalize(result.title);
    const subtitle = this.normalize(result.subtitle);
    const keywords = result.keywords.map((keyword) => this.normalize(keyword));

    if (title === query) {
      return 100;
    }

    if (title.startsWith(query)) {
      return 80;
    }

    if (keywords.some((keyword) => keyword === query || keyword.startsWith(query))) {
      return 60;
    }

    if (title.includes(query)) {
      return 40;
    }

    if (keywords.some((keyword) => keyword.includes(query)) || subtitle.includes(query)) {
      return 20;
    }

    return 0;
  }

  private keywordsFor(label: string, route: string, section: string): string[] {
    return [label, section, ...route.replace('/admin/', '').split(/[-/]/)]
      .flatMap((value) => value.split(/\s+/))
      .map((value) => this.normalize(value))
      .filter(Boolean);
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }
}

const SEARCHABLE_ADMIN_ROUTES = new Set([
  '/admin/orders',
  '/admin/products',
  '/admin/customers',
  '/admin/categories',
  '/admin/inventory',
  '/admin/reviews',
  '/admin/discounts',
  '/admin/promotions-ads',
  '/admin/media-library',
  '/admin/payments',
  '/admin/shipping',
]);
