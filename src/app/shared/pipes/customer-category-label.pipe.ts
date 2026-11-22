import { Pipe, PipeTransform, inject } from '@angular/core';
import { Category } from '../../data-access/models';
import { CustomerCategoryLabelService } from '../../data-access/services/customer-category-label.service';

@Pipe({ name: 'customerCategoryLabel', pure: false })
export class CustomerCategoryLabelPipe implements PipeTransform {
  private readonly categories = inject(CustomerCategoryLabelService);

  transform(category: Category | string, categoryId?: string | null): string {
    return this.categories.label(category, categoryId);
  }
}
