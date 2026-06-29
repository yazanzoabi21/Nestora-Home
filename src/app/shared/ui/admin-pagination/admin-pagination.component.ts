import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

type PageItem = number | 'ellipsis';

@Component({
  selector: 'app-admin-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule],
  templateUrl: './admin-pagination.component.html',
  styleUrl: './admin-pagination.component.css',
})
export class AdminPaginationComponent {
  @Input() currentPage = 1;
  @Input() totalItems = 0;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [10, 25, 50];
  @Input() showPageSize = true;
  @Input() showSummary = true;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.safePageSize));
  }

  get safeCurrentPage(): number {
    return Math.min(Math.max(this.currentPage, 1), this.totalPages);
  }

  get startItem(): number {
    if (this.totalItems === 0) {
      return 0;
    }

    return (this.safeCurrentPage - 1) * this.safePageSize + 1;
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

    if (currentPage > 2) {
      pages.add(currentPage - 1);
    }

    if (currentPage < totalPages - 1) {
      pages.add(currentPage + 1);
    }

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

  setPageSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0 || size === this.pageSize) {
      return;
    }

    this.pageSizeChange.emit(size);
    this.pageChange.emit(1);
  }

  private get safePageSize(): number {
    return Math.max(1, this.pageSize);
  }
}
