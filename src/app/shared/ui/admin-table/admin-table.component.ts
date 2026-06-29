import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPaginationComponent } from '../admin-pagination';

export type AdminTableColumnType = 'text' | 'imageText' | 'badge' | 'price' | 'number' | 'stock' | 'status' | 'actions';

export interface AdminTableColumn {
  key: string;
  label: string;
  type: AdminTableColumnType;
  sortable?: boolean;
}

export interface AdminTableImageTextCell {
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  initials?: string;
  featured?: boolean;
}

export interface AdminTableBadgeCell {
  label?: string;
  labelKey?: string;
  className?: string;
}

export interface AdminTableNumberCell {
  value: number | string;
  status?: string;
  barClass?: string;
  textClass?: string;
}

export interface AdminTablePriceCell {
  value: number | string;
  originalValue?: number | string | null;
}

export type AdminTableRow = Record<string, unknown> & {
  id: string;
  raw?: unknown;
};

@Component({
  selector: 'app-admin-table',
  standalone: true,
  imports: [AdminPaginationComponent, CommonModule, TranslatePipe],
  templateUrl: './admin-table.component.html',
  styleUrl: './admin-table.component.css',
})
export class AdminTableComponent implements OnChanges {
  @Input() columns: AdminTableColumn[] = [];
  @Input() rows: AdminTableRow[] = [];
  @Input() loading = false;
  @Input() emptyTitle = 'No data found';
  @Input() emptyText = 'Items will appear here when available.';
  @Input() selectable = false;
  @Input() showActions = true;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [10, 25, 50];
  @Input() showPageSize = true;
  @Input() showPaginationSummary = true;
  @Input() selectionResetKey = 0;

  @Output() rowView = new EventEmitter<AdminTableRow>();
  @Output() rowEdit = new EventEmitter<AdminTableRow>();
  @Output() rowDelete = new EventEmitter<AdminTableRow>();
  @Output() selectionChange = new EventEmitter<AdminTableRow[]>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly currentPage = signal(1);
  readonly selectedIds = signal<Set<string>>(new Set());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectionResetKey'] && !changes['selectionResetKey'].firstChange) {
      this.clearSelection();
    }
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.selectionChange.emit([]);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get visibleRows(): AdminTableRow[] {
    const page = Math.min(this.currentPage(), this.totalPages);
    const start = (page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  readonly skeletonRows = Array.from({ length: 5 });

  get visibleColumns(): AdminTableColumn[] {
    return this.showActions ? this.columns : this.columns.filter((column) => column.type !== 'actions');
  }

  get colspan(): number {
    return this.visibleColumns.length + (this.selectable ? 1 : 0);
  }

  setPage(page: number): void {
    const nextPage = Math.min(Math.max(page, 1), this.totalPages);
    this.currentPage.set(nextPage);
    this.pageChange.emit(nextPage);
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage.set(1);
    this.pageSizeChange.emit(size);
  }

  isSelected(row: AdminTableRow): boolean {
    return this.selectedIds().has(row.id);
  }

  toggleRow(row: AdminTableRow): void {
    const nextSelection = new Set(this.selectedIds());

    if (nextSelection.has(row.id)) {
      nextSelection.delete(row.id);
    } else {
      nextSelection.add(row.id);
    }

    this.selectedIds.set(nextSelection);
    this.emitSelection();
  }

  toggleVisibleRows(): void {
    const nextSelection = new Set(this.selectedIds());
    const visibleRows = this.visibleRows;
    const allVisibleSelected = visibleRows.every((row) => nextSelection.has(row.id));

    for (const row of visibleRows) {
      if (allVisibleSelected) {
        nextSelection.delete(row.id);
      } else {
        nextSelection.add(row.id);
      }
    }

    this.selectedIds.set(nextSelection);
    this.emitSelection();
  }

  areVisibleRowsSelected(): boolean {
    const visibleRows = this.visibleRows;
    return visibleRows.length > 0 && visibleRows.every((row) => this.selectedIds().has(row.id));
  }

  imageTextCell(row: AdminTableRow, key: string): AdminTableImageTextCell {
    return row[key] as AdminTableImageTextCell;
  }

  badgeCell(row: AdminTableRow, key: string): AdminTableBadgeCell {
    return row[key] as AdminTableBadgeCell;
  }

  numberCell(row: AdminTableRow, key: string): AdminTableNumberCell | number | string {
    return row[key] as AdminTableNumberCell | number | string;
  }

  isNumberCellObject(value: AdminTableNumberCell | number | string): value is AdminTableNumberCell {
    return typeof value === 'object' && value !== null && 'value' in value;
  }

  priceCell(row: AdminTableRow, key: string): AdminTablePriceCell | number | string {
    return row[key] as AdminTablePriceCell | number | string;
  }

  isPriceCellObject(value: AdminTablePriceCell | number | string): value is AdminTablePriceCell {
    return typeof value === 'object' && value !== null && 'value' in value;
  }

  textCell(row: AdminTableRow, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  isIconValue(value: string | null | undefined): boolean {
    return !!value && (value.startsWith('pi ') || value.startsWith('fa ') || value.startsWith('fa-'));
  }

  cellValue(row: AdminTableRow, key: string): unknown {
    return row[key];
  }

  actionPayload(row: AdminTableRow): AdminTableRow {
    return (row.raw as AdminTableRow | undefined) ?? row;
  }

  statusLabelKey(status: unknown): string {
    return `PRODUCTS.STATUS.${String(status).toUpperCase()}`;
  }

  statusBadgeClass(status: unknown): string {
    switch (status) {
      case 'out_of_stock':
        return 'bg-[#fff1f0] text-[#b42318]';
      case 'low_stock':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'in_stock':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  stockBarClass(status: unknown): string {
    switch (status) {
      case 'out_of_stock':
        return 'bg-[#dc3f35]';
      case 'low_stock':
        return 'bg-[#d98916]';
      case 'in_stock':
      default:
        return 'bg-[#43b374]';
    }
  }

  stockTextClass(status: unknown): string {
    switch (status) {
      case 'out_of_stock':
        return 'text-[#dc3f35]';
      case 'low_stock':
        return 'text-[#d98916]';
      case 'in_stock':
      default:
        return 'text-[#182116]';
    }
  }

  private emitSelection(): void {
    const ids = this.selectedIds();
    this.selectionChange.emit(this.rows.filter((row) => ids.has(row.id)));
  }
}
