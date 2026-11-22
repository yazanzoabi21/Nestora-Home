import { CustomerCategoryLabelPipe } from '../../../../shared/pipes/customer-category-label.pipe';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Category } from '../../../../data-access/models';

@Component({
  selector: 'app-customer-recently-viewed-empty',
  standalone: true,
  imports: [CustomerCategoryLabelPipe,RouterLink, TranslatePipe],
  templateUrl: './customer-recently-viewed-empty.component.html',
  styleUrl: './customer-recently-viewed-empty.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerRecentlyViewedEmptyComponent {
  readonly categories = input<readonly Category[]>([]);
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  readonly visibleCategories = computed(() =>
    this.categories()
      .filter((category) => category.is_active !== false && category.name.trim() &&
        category.slug.trim() && category.image_url?.trim() &&
        !this.failedImages().has(category.image_url))
      .slice(0, 3),
  );

  onImageError(imageUrl: string | null | undefined): void {
    if (imageUrl) this.failedImages.update((failed) => new Set([...failed, imageUrl]));
  }
}
