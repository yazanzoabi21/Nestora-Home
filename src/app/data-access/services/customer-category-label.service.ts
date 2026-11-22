import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Category } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CustomerCategoryLabelService {
  private readonly categories = signal<readonly Category[]>([]);
  private readonly translate = inject(TranslateService, { optional: true });

  setCategories(categories: readonly Category[]): void {
    this.categories.set(categories);
  }

  label(category: Category | string, categoryId?: string | null): string {
    if (this.translate?.getCurrentLang() !== 'ar') {
      return typeof category === 'string' ? category : category.name;
    }

    const record = typeof category === 'string'
      ? this.categories().find((entry) => categoryId ? entry.id === categoryId : entry.name === category)
      : category;
    return record?.name_ar?.trim() || (typeof category === 'string' ? category : category.name);
  }
}
