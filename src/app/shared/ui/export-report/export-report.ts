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
}

export interface ExportReportConfig {
  fileName: string;
  reportTitle: string;
  reportSubtitle?: string;
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

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setTextColor(31, 42, 31);
    doc.text(this.config.reportTitle, pageWidth / 2, 18, {
      align: 'center',
    });

    if (this.config.reportSubtitle) {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(this.config.reportSubtitle, pageWidth / 2, 25, {
        align: 'center',
      });
    }

    let startY = this.config.reportSubtitle ? 35 : 30;

    this.config.sections.forEach((section) => {
      doc.setFontSize(13);
      doc.setTextColor(31, 42, 31);
      doc.text(section.title, 14, startY);

      autoTable(doc, {
        startY: startY + 5,
        head: [section.headers],
        body: section.rows,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 3,
          textColor: [31, 42, 31],
        },
        headStyles: {
          fillColor: [95, 111, 67],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [247, 244, 239],
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      startY = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!
            .finalY + 14
        : startY + 40;

      if (startY > 260) {
        doc.addPage();
        startY = 20;
      }
    });

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