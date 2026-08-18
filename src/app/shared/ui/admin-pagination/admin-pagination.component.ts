import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

type PageItem = number | 'ellipsis';
export type PaginationPageSize = number | 'all';

export function paginationPageSizeLabel(size: PaginationPageSize): string {
  return size === 'all' ? 'COMMON.PAGINATION.ALL' : String(size);
}

@Component({
  selector: 'app-admin-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-pagination.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaginationComponent {
  @Input() currentPage = 1;
  @Input() totalItems = 0;
  @Input() pageSize: PaginationPageSize = 12;
  @Input() pageSizeOptions: PaginationPageSize[] = [12, 20, 25, 'all'];
  @Input() showPageSize = true;
  @Input() showSummary = true;
  @Input() variant: 'admin' | 'customer' = 'admin';
  @Input() summaryKey: string | null = null;
  @Input() ariaLabelKey = 'COMMON.PAGINATION.ARIA_LABEL';
  @Input() previousPageLabelKey = 'COMMON.PAGINATION.PREVIOUS_PAGE';
  @Input() nextPageLabelKey = 'COMMON.PAGINATION.NEXT_PAGE';

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<PaginationPageSize>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.safePageSize));
  }

  get safeCurrentPage(): number {
    return Math.min(Math.max(this.currentPage, 1), this.totalPages);
  }

  get startItem(): number {
    return this.totalItems === 0
      ? 0
      : (this.safeCurrentPage - 1) * this.safePageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.safeCurrentPage * this.safePageSize, this.totalItems);
  }

  get pageItems(): PageItem[] {
    const totalPages = this.totalPages;
    const currentPage = this.safeCurrentPage;

    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, currentPage]);

    if (currentPage > 2) pages.add(currentPage - 1);
    if (currentPage < totalPages - 1) pages.add(currentPage + 1);

    if (currentPage <= 4) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }

    if (currentPage >= totalPages - 3) {
      pages.add(totalPages - 1);
      pages.add(totalPages - 2);
      pages.add(totalPages - 3);
    }

    return Array.from(pages)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((first, second) => first - second)
      .reduce<PageItem[]>((items, page) => {
        const previous = items.at(-1);

        if (typeof previous === 'number' && page - previous > 1) {
          items.push('ellipsis');
        }

        items.push(page);
        return items;
      }, []);
  }

  setPage(page: number): void {
    const nextPage = Math.min(Math.max(page, 1), this.totalPages);

    if (nextPage !== this.safeCurrentPage) {
      this.pageChange.emit(nextPage);
    }
  }

  setPageSize(size: PaginationPageSize): void {
    if (size === this.pageSize || (typeof size === 'number' && size <= 0)) {
      return;
    }

    this.pageSizeChange.emit(size);
    this.pageChange.emit(1);
  }

  pageSizeLabel(size: PaginationPageSize): string {
    return paginationPageSizeLabel(size);
  }

  private get safePageSize(): number {
    if (this.pageSize === 'all') {
      return Math.max(this.totalItems, 1);
    }

    return Math.max(this.pageSize, 1);
  }
}
