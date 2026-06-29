import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  signal,
} from '@angular/core';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ExportCell = string | number;

export interface ExportReportSection {
  title: string;
  headers: string[];
  rows: ExportCell[][];
  excludedPdfColumns?: string[];
  columnWidths?: Record<string, number>;
  truncateColumns?: string[];
}

export interface ExportReportConfig {
  fileName: string;
  reportTitle: string;
  reportSubtitle?: string;
  orientation?: 'portrait' | 'landscape';
  summaryItems?: Array<{
    label: string;
    value: string | number;
  }>;
  sections: ExportReportSection[];
}

@Component({
  selector: 'app-export-report',
  standalone: true,
  templateUrl: './export-report.html',
  styleUrl: './export-report.css',
})
export class ExportReportComponent {
  @Input({ required: true }) config!: ExportReportConfig;
  @Input() variant: 'primary' | 'secondary' = 'primary';
  @Input() buttonLabel = 'Export Report';
  @Input() buttonIcon = 'pi pi-download';

  readonly isOpen = signal(false);

  @ViewChild('exportWrapper') exportWrapper?: ElementRef<HTMLElement>;

  toggleMenu(): void {
    this.isOpen.update((value) => !value);
  }

  closeMenu(): void {
    this.isOpen.set(false);
  }

  exportPdf(): void {
    if (!this.config) {
      return;
    }

    const generatedAt = new Date();
    const doc = new jsPDF({
      orientation: this.config.orientation ?? 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const brandGreen: [number, number, number] = [95, 111, 67];
    const ink: [number, number, number] = [31, 42, 31];
    const muted: [number, number, number] = [120, 120, 120];

    doc.setFillColor(251, 250, 248);
    doc.rect(0, 0, pageWidth, 36, 'F');
    doc.setDrawColor(229, 222, 210);
    doc.line(marginX, 36, pageWidth - marginX, 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...ink);
    doc.text(this.config.reportTitle, marginX, 15);

    if (this.config.reportSubtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...muted);
      doc.text(this.config.reportSubtitle, marginX, 22);
    }

    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(
      `Generated ${this.formatDateTime(generatedAt)}`,
      pageWidth - marginX,
      15,
      { align: 'right' }
    );

    let startY = 44;

    if (this.config.summaryItems?.length) {
      const summaryWidth = (pageWidth - marginX * 2) / this.config.summaryItems.length;

      this.config.summaryItems.forEach((item, index) => {
        const x = marginX + index * summaryWidth;

        doc.setFillColor(255, 253, 250);
        doc.setDrawColor(229, 222, 210);
        doc.roundedRect(x, startY, summaryWidth - 3, 16, 3, 3, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(item.label.toUpperCase(), x + 4, startY + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...ink);
        doc.text(String(item.value), x + 4, startY + 12);
      });

      startY += 24;
    }

    this.config.sections.forEach((section) => {
      const pdfSection = this.createPdfSection(section);

      if (pdfSection.headers.length === 0) {
        return;
      }

      if (startY > pageHeight - 42) {
        doc.addPage();
        startY = 18;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...ink);
      doc.text(section.title, marginX, startY);

      autoTable(doc, {
        startY: startY + 5,
        head: [pdfSection.headers],
        body: pdfSection.rows,
        theme: 'grid',
        tableWidth: 'auto',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2.2,
          overflow: 'ellipsize',
          minCellHeight: 7,
          valign: 'middle',
          lineColor: [229, 222, 210],
          lineWidth: 0.1,
          textColor: ink,
        },
        headStyles: {
          fillColor: brandGreen,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
          minCellHeight: 8,
        },
        alternateRowStyles: {
          fillColor: [251, 250, 248],
        },
        margin: {
          left: marginX,
          right: marginX,
        },
        columnStyles: this.createColumnStyles(pdfSection.headers, section.columnWidths),
        didDrawPage: () => {
          this.drawFooter(doc, generatedAt);
        },
      });

      startY = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!
            .finalY + 14
        : startY + 40;

      if (startY > pageHeight - 28) {
        doc.addPage();
        startY = 18;
      }
    });

    this.addPageNumbers(doc, generatedAt);
    doc.save(`${this.config.fileName}.pdf`);
    this.closeMenu();
  }

  exportExcel(): void {
    if (!this.config) {
      return;
    }

    const workbook = XLSX.utils.book_new();

    this.config.sections.forEach((section) => {
      const sheetData = [section.headers, ...section.rows];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

      worksheet['!cols'] = section.headers.map(() => ({
        wch: 22,
      }));

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.sanitizeSheetName(section.title)
      );
    });

    XLSX.writeFile(workbook, `${this.config.fileName}.xlsx`);
    this.closeMenu();
  }

  private sanitizeSheetName(name: string): string {
    return name.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
  }

  private createPdfSection(section: ExportReportSection): ExportReportSection {
    const excludedColumns = new Set(section.excludedPdfColumns ?? []);
    const includedIndexes = section.headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => !excludedColumns.has(header));
    const truncateColumns = new Set(section.truncateColumns ?? []);

    return {
      ...section,
      headers: includedIndexes.map(({ header }) => header),
      rows: section.rows.map((row) =>
        includedIndexes.map(({ header, index }) => {
          const value = row[index] ?? '-';

          return truncateColumns.has(header)
            ? this.truncateCell(value, 42)
            : this.normalizePdfCell(value);
        })
      ),
    };
  }

  private createColumnStyles(
    headers: string[],
    columnWidths: Record<string, number> | undefined
  ): Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> {
    return headers.reduce<Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }>>(
      (styles, header, index) => {
        if (columnWidths?.[header]) {
          styles[index] = {
            cellWidth: columnWidths[header],
            halign: this.numericColumn(header) ? 'right' : 'left',
          };
        }

        return styles;
      },
      {}
    );
  }

  private normalizePdfCell(value: ExportCell): string | number {
    if (typeof value === 'number') {
      return value;
    }

    return value.replace(/\s+/g, ' ').trim();
  }

  private truncateCell(value: ExportCell, maxLength: number): string | number {
    if (typeof value === 'number') {
      return value;
    }

    const normalized = this.normalizePdfCell(value);

    if (typeof normalized !== 'string' || normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private numericColumn(header: string): boolean {
    return ['Price', 'Sale Price', 'Stock', 'Sold', 'Rating'].includes(header);
  }

  private addPageNumbers(doc: jsPDF, generatedAt: Date): void {
    const pageCount = doc.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      doc.setPage(pageNumber);
      this.drawFooter(doc, generatedAt, pageNumber, pageCount);
    }
  }

  private drawFooter(
    doc: jsPDF,
    generatedAt: Date,
    pageNumber = doc.getCurrentPageInfo().pageNumber,
    pageCount = doc.getNumberOfPages()
  ): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(229, 222, 210);
    doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${this.formatDateTime(generatedAt)}`, 10, pageHeight - 6);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - 10, pageHeight - 6, {
      align: 'right',
    });
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;

    if (!this.exportWrapper?.nativeElement.contains(target)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
