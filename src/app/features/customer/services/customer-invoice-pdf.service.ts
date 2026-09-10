import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { jsPDF } from 'jspdf';

import { AuthenticatedUserProfile } from '../../../core/models/auth';
import { CustomerAuthService } from '../../../core/services/auth';
import { CustomerOrder, CustomerOrderItem } from '../orders/customer-order.model';

const BRAND = {
  ink: '#1f2a1f',
  green: '#6b7d5e',
  sage: '#718369',
  beige: '#e8dccf',
  cream: '#faf8f5',
  muted: '#76756d',
  line: '#e5e0d8',
  paleGreen: '#e9f0e5',
} as const;

@Injectable({ providedIn: 'root' })
export class CustomerInvoicePdfService {
  private readonly auth = inject(CustomerAuthService);
  private readonly document = inject(DOCUMENT);

  async download(order: CustomerOrder, customer: AuthenticatedUserProfile): Promise<void> {
    this.assertOwner(order, customer);
    const { jsPDF } = await import('jspdf');
    await this.document.fonts.ready;

    const [logo, productImages] = await Promise.all([
      this.loadImage(new URL('images/logo-bg.png', this.document.baseURI).href),
      this.loadProductImages(order.items),
    ]);
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pdf.setProperties({
      title: `Nestora Home Invoice ${order.orderNumber}`,
      author: 'Nestora Home',
      subject: `Order ${order.orderNumber}`,
    });

    const renderer = new InvoiceRenderer(this.document, pdf, logo, productImages);
    try {
      await renderer.render(order, customer);
      this.assertOwner(order, customer);
      const number = order.orderNumber.replace(/[^\p{L}\p{N}_-]/gu, '-');
      await pdf.save(`Nestora-Home-Invoice-${number || order.id}.pdf`, { returnPromise: true });
    } finally {
      renderer.dispose();
    }
  }

  private async loadProductImages(
    items: readonly CustomerOrderItem[],
  ): Promise<ReadonlyMap<string, HTMLImageElement>> {
    const entries = await Promise.all(items.map(async (item) => {
      const image = item.productImageUrl ? await this.loadImage(item.productImageUrl) : null;
      return image ? ([item.id, image] as const) : null;
    }));
    return new Map(entries.filter((entry): entry is readonly [string, HTMLImageElement] => entry !== null));
  }

  private loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = this.document.createElement('img');
      let settled = false;
      const finish = (result: HTMLImageElement | null): void => {
        if (settled) return;
        settled = true;
        this.document.defaultView?.clearTimeout(timeoutId);
        resolve(result);
      };
      const timeoutId = this.document.defaultView?.setTimeout(() => finish(null), 5000);
      image.crossOrigin = 'anonymous';
      image.onload = () => finish(image);
      image.onerror = () => finish(null);
      image.src = url;
    });
  }

  private assertOwner(order: CustomerOrder, customer: AuthenticatedUserProfile): void {
    if (!this.auth.isAuthenticated() || this.auth.user()?.id !== order.userId || customer.id !== order.userId) {
      throw new Error('You must be signed in as the customer who placed this order.');
    }
  }
}

class InvoiceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width = 595.28;
  private readonly height = 841.89;
  private readonly margin = 32;
  private readonly contentBottom = 778;
  private readonly money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  private y = 0;
  private page = 0;

  constructor(
    document: Document,
    private readonly pdf: jsPDF,
    private readonly logo: HTMLImageElement | null,
    private readonly productImages: ReadonlyMap<string, HTMLImageElement>,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(this.width * 2.5);
    this.canvas.height = Math.ceil(this.height * 2.5);
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Invoice rendering is unavailable.');
    this.ctx = context;
    this.ctx.scale(2.5, 2.5);
  }

  async render(order: CustomerOrder, customer: AuthenticatedUserProfile): Promise<void> {
    this.startPage(true, order);
    this.drawCustomerDetails(order, customer);
    this.y = 330;
    this.tableHeader();

    for (const [index, item] of order.items.entries()) {
      await this.itemRow(item, index, order);
    }
    if (!order.items.length) {
      this.roundedCard(this.margin, this.y, this.width - this.margin * 2, 48, '#ffffff', BRAND.line);
      this.text('Order item details are not available.', this.margin + 16, this.y + 29, 10, BRAND.muted);
      this.y += 48;
    }

    const closingHeight = 132 + this.totalLines(order).length * 24;
    if (this.y + closingHeight > this.contentBottom) {
      this.finishPage(false);
      this.startPage(false, order);
    }
    this.drawClosing(order);
    this.finishPage(true);
  }

  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private startPage(first: boolean, order: CustomerOrder): void {
    this.page += 1;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.fill(0, 0, this.width, this.height, '#fffefc');
    this.drawHeader(first, order);
    this.y = first ? 330 : 112;
  }

  private drawHeader(first: boolean, order: CustomerOrder): void {
    this.drawLeaves(first ? 324 : 350, first ? 4 : -18, first ? 1 : 0.7);
    if (this.logo) this.drawContainedImage(this.logo, this.margin, first ? 24 : 19, first ? 66 : 48, first ? 66 : 48);

    const brandX = this.margin + (this.logo ? (first ? 76 : 57) : 0);
    this.text('Nestora Home', brandX, first ? 57 : 46, first ? 24 : 18, BRAND.ink, true, 'left', 'Georgia, serif');
    if (first) this.trackedText('FOR A BETTER HOME', brandX + 1, 78, 7.5, BRAND.muted, 3.1);

    this.trackedText('INVOICE', this.width - this.margin, first ? 61 : 43, first ? 19 : 15, BRAND.ink, 4.1, 'right', true);
    if (first) {
      this.trackedText('THANK YOU FOR SHOPPING WITH US', this.width - this.margin, 80, 6.5, BRAND.muted, 1.8, 'right');
      this.drawOrderCard(order);
    } else {
      this.text(order.orderNumber, this.width - this.margin, 64, 8.5, BRAND.muted, false, 'right');
      this.fill(this.margin, 84, this.width - this.margin * 2, 1, BRAND.line);
    }
  }

  private drawOrderCard(order: CustomerOrder): void {
    const x = 300;
    const y = 106;
    const width = this.width - this.margin - x;
    this.roundedCard(x, y, width, 101, BRAND.cream);
    const labelX = x + 18;
    const valueX = x + 112;
    const rows: readonly [string, string][] = [
      ['Order / Invoice No.', order.orderNumber],
      ['Order Date', this.formatDate(order.createdAt)],
    ];
    rows.forEach(([label, value], index) => {
      const baseline = y + 23 + index * 23;
      this.text(label, labelX, baseline, 8.5);
      this.text(value, valueX, baseline, 8.5, BRAND.ink, true);
    });
    this.text('Order Status', labelX, y + 69, 8.5);
    this.badge(this.status(order.status), valueX, y + 56, this.statusTone(order.status));
    this.text('Payment Status', labelX, y + 92, 8.5);
    this.badge(this.status(order.paymentStatus), valueX, y + 79, this.statusTone(order.paymentStatus));
  }

  private drawCustomerDetails(order: CustomerOrder, customer: AuthenticatedUserProfile): void {
    const top = 236;
    const dividerX = 306;
    this.icon('user', this.margin + 1, top - 2, BRAND.green);
    this.text('Customer Information', this.margin + 30, top + 13, 14.5, BRAND.ink, true, 'left', 'Georgia, serif');
    this.icon('location', dividerX + 21, top - 2, BRAND.green);
    this.text('Delivery Address', dividerX + 52, top + 13, 14.5, BRAND.ink, true, 'left', 'Georgia, serif');
    this.fill(dividerX, top - 5, 1, 77, BRAND.line);

    const details = [
      ['person', customer.full_name?.trim() || 'Not provided'],
      ['mail', customer.email?.trim() || 'Not provided'],
      ['phone', order.phone?.trim() || customer.phone?.trim() || 'Not provided'],
    ] as const;
    details.forEach(([icon, value], index) => {
      const baseline = top + 43 + index * 20;
      this.icon(icon, this.margin + 4, baseline - 12, BRAND.ink, 0.72);
      this.text(value, this.margin + 31, baseline, 9.5);
    });

    this.icon('home', dividerX + 22, top + 38, BRAND.ink, 0.8);
    const address = [order.address, order.city, order.country]
      .map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(', ') || 'Not provided';
    this.drawWrappedText(address, dividerX + 52, top + 43, this.width - this.margin - dividerX - 56, 9.5, 14);
  }

  private tableHeader(): void {
    const width = this.width - this.margin * 2;
    this.ctx.save();
    this.pathRoundedRect(this.margin, this.y, width, 34, 6);
    this.ctx.clip();
    this.fill(this.margin, this.y, width, 34, BRAND.green);
    this.ctx.restore();
    this.text('#', this.margin + 16, this.y + 22, 9, '#ffffff', true);
    this.text('Product', this.margin + 47, this.y + 22, 9, '#ffffff', true);
    this.text('Quantity', 374, this.y + 22, 9, '#ffffff', true, 'right');
    this.text('Unit Price', 469, this.y + 22, 9, '#ffffff', true, 'right');
    this.text('Total', this.width - this.margin - 13, this.y + 22, 9, '#ffffff', true, 'right');
    this.y += 34;
  }

  private async itemRow(item: CustomerOrderItem, index: number, order: CustomerOrder): Promise<void> {
    const name = [item.productName || item.productId, item.variantName, item.variantSku ? `SKU: ${item.variantSku}` : null]
      .filter((value): value is string => Boolean(value)).join(' - ');
    const lines = this.wrap(name, 195, 9.6, true);
    const rowHeight = Math.max(64, lines.length * 14 + 24);
    const closingHeight = 132 + this.totalLines(order).length * 24;
    const keepWithClosing = index === order.items.length - 1 ? closingHeight : 0;
    if (this.y + rowHeight + keepWithClosing > this.contentBottom) {
      this.finishPage(false);
      this.startPage(false, order);
      this.tableHeader();
    }

    if (index % 2 === 0) this.fill(this.margin, this.y, this.width - this.margin * 2, rowHeight, BRAND.cream);
    this.text(String(index + 1), this.margin + 16, this.y + 35, 9.5);
    const image = this.productImages.get(item.id);
    if (image) {
      this.roundedImage(image, this.margin + 45, this.y + 9, 46, 46, 7);
    } else {
      this.roundedCard(this.margin + 45, this.y + 9, 46, 46, BRAND.cream, BRAND.line, 7);
      this.icon('leaf', this.margin + 58, this.y + 21, BRAND.sage, 0.75);
    }

    lines.forEach((line, lineIndex) => {
      this.text(line, this.margin + 101, this.y + 26 + lineIndex * 14, 9.6, BRAND.ink, lineIndex === 0);
    });
    this.text(String(item.quantity), 374, this.y + 35, 9.5, BRAND.ink, false, 'right');
    this.text(this.money.format(item.unitPrice), 469, this.y + 35, 9.5, BRAND.ink, false, 'right');
    this.text(this.money.format(item.lineTotal), this.width - this.margin - 13, this.y + 35, 9.5, BRAND.ink, false, 'right');
    this.y += rowHeight;
    this.fill(this.margin + 14, this.y - 1, this.width - this.margin * 2 - 28, 0.6, BRAND.line);
    if (index % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  private drawClosing(order: CustomerOrder): void {
    this.y += 10;
    const leftWidth = 248;
    const gap = 20;
    const rightX = this.margin + leftWidth + gap;
    const rightWidth = this.width - this.margin - rightX;
    const lines = this.totalLines(order);
    const cardHeight = 54 + lines.length * 24;

    this.roundedCard(this.margin, this.y, leftWidth, cardHeight, BRAND.cream);
    this.icon('heart', this.margin + leftWidth / 2 - 10, this.y + 12, BRAND.sage, 0.8);
    this.text('A more beautiful', this.margin + leftWidth / 2, this.y + 51, 14, BRAND.sage, false, 'center', 'Georgia, serif', true);
    this.text('home for a brighter you.', this.margin + leftWidth / 2, this.y + 69, 13, BRAND.sage, false, 'center', 'Georgia, serif', true);
    this.fill(this.margin + 94, this.y + 83, 60, 1, BRAND.beige);

    this.roundedCard(rightX, this.y, rightWidth, cardHeight, '#ffffff', BRAND.line);
    lines.forEach(([label, amount], index) => {
      const baseline = this.y + 22 + index * 24;
      this.text(label, rightX + 17, baseline, 10, label === 'Discount' ? BRAND.green : BRAND.ink);
      this.text(this.money.format(amount), rightX + rightWidth - 17, baseline, 10,
        label === 'Discount' ? BRAND.green : BRAND.ink, false, 'right');
    });
    const totalY = this.y + 15 + lines.length * 24;
    this.fill(rightX, totalY - 8, rightWidth, 1, BRAND.line);
    this.ctx.save();
    this.pathRoundedRect(rightX, totalY, rightWidth, 39, 7);
    this.ctx.clip();
    this.fill(rightX, totalY, rightWidth, 39, BRAND.paleGreen);
    this.ctx.restore();
    this.text('Final Total', rightX + 17, totalY + 25, 13, BRAND.ink, true);
    this.text(this.money.format(order.total), rightX + rightWidth - 17, totalY + 25, 14, BRAND.ink, true, 'right');
    this.y += cardHeight + 18;
    this.drawBenefits();
  }

  private drawBenefits(): void {
    const items = [
      ['truck', 'Fast & Reliable', 'Delivery'],
      ['shield', 'Secure', 'Payments'],
      ['leaf', 'Quality', 'Home Products'],
      ['heart', 'A Happier', 'Home'],
    ] as const;
    const columnWidth = (this.width - this.margin * 2) / items.length;
    items.forEach(([icon, first, second], index) => {
      const x = this.margin + index * columnWidth;
      if (index > 0) this.fill(x, this.y + 4, 1, 39, BRAND.line);
      this.icon(icon, x + 15, this.y + 8, BRAND.ink, 0.9);
      this.text(first, x + 47, this.y + 22, 8.2);
      this.text(second, x + 47, this.y + 35, 8.2);
    });
    this.y += 50;
  }

  private finishPage(final: boolean): void {
    if (final) {
      this.fill(this.margin, 773, this.width - this.margin * 2, 1, BRAND.line);
      this.text('Thank you for shopping with Nestora Home!', this.width / 2, 799, 14,
        BRAND.ink, true, 'center', 'Georgia, serif');
      this.trackedText('WE APPRECIATE YOUR TRUST', this.width / 2, 819, 6.5, BRAND.muted, 2.2, 'center');
    } else {
      this.fill(this.margin, 797, this.width - this.margin * 2, 1, BRAND.line);
      this.text('Nestora Home', this.margin, 816, 8, BRAND.sage);
      this.text(`Page ${this.page}`, this.width - this.margin, 816, 8, BRAND.sage, false, 'right');
    }
    if (this.page > 1) this.pdf.addPage();
    this.pdf.addImage(this.canvas, 'PNG', 0, 0, this.width, this.height, undefined, 'FAST');
  }

  private totalLines(order: CustomerOrder): readonly [string, number][] {
    const lines: [string, number][] = [['Subtotal', order.subtotal]];
    if (order.discountAmount > 0) lines.push(['Discount', -order.discountAmount]);
    lines.push(['Shipping', order.shipping]);
    if (order.paymentFee > 0) lines.push(['Payment Fee', order.paymentFee]);
    return lines;
  }

  private badge(label: string, x: number, y: number, color: string): void {
    this.ctx.font = '600 7.5px Arial, sans-serif';
    const width = Math.max(42, this.ctx.measureText(label).width + 17);
    this.roundedCard(x, y, width, 17, color, undefined, 8.5);
    this.text(label, x + width / 2, y + 11.5, 7.5, BRAND.ink, true, 'center');
  }

  private statusTone(status: string): string {
    const normalized = status.toLowerCase();
    if (['paid', 'delivered', 'completed'].includes(normalized)) return '#dcebdd';
    if (['unpaid', 'failed', 'cancelled', 'canceled', 'refunded'].includes(normalized)) return '#f5dcd6';
    if (['pending', 'processing'].includes(normalized)) return '#f2e4c9';
    return '#e8e8e3';
  }

  private status(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private formatDate(value: string | null): string {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Not available';
  }

  private drawLeaves(x: number, y: number, scale: number): void {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    this.ctx.strokeStyle = '#ded6c7';
    this.ctx.fillStyle = '#eee9df';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 100);
    this.ctx.bezierCurveTo(32, 57, 62, 32, 112, 12);
    this.ctx.stroke();
    [[18, 72, -0.65], [39, 52, 0.58], [59, 35, -0.55], [82, 22, 0.5]].forEach(([lx, ly, rotation]) => {
      this.ctx.save();
      this.ctx.translate(lx, ly);
      this.ctx.rotate(rotation);
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  private icon(name: string, x: number, y: number, color: string, scale = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (name === 'user' || name === 'person') {
      ctx.arc(10, 6, 4.5, 0, Math.PI * 2);
      ctx.moveTo(3, 21); ctx.quadraticCurveTo(3, 12, 10, 12); ctx.quadraticCurveTo(17, 12, 17, 21);
    } else if (name === 'location') {
      ctx.arc(10, 8, 7, Math.PI, 0); ctx.quadraticCurveTo(17, 13, 10, 22); ctx.quadraticCurveTo(3, 13, 3, 8);
      ctx.moveTo(10, 5); ctx.arc(10, 8, 3, -Math.PI / 2, Math.PI * 1.5);
    } else if (name === 'mail') {
      ctx.rect(1, 4, 18, 13); ctx.moveTo(1, 5); ctx.lineTo(10, 12); ctx.lineTo(19, 5);
    } else if (name === 'phone') {
      ctx.moveTo(4, 2); ctx.quadraticCurveTo(1, 4, 4, 10); ctx.quadraticCurveTo(8, 17, 15, 19);
      ctx.quadraticCurveTo(19, 20, 20, 16); ctx.lineTo(16, 13); ctx.lineTo(13, 16);
      ctx.quadraticCurveTo(8, 14, 6, 9); ctx.lineTo(9, 6); ctx.closePath();
    } else if (name === 'home') {
      ctx.moveTo(1, 10); ctx.lineTo(10, 2); ctx.lineTo(19, 10); ctx.moveTo(4, 8); ctx.lineTo(4, 20);
      ctx.lineTo(16, 20); ctx.lineTo(16, 8); ctx.moveTo(8, 20); ctx.lineTo(8, 13); ctx.lineTo(12, 13); ctx.lineTo(12, 20);
    } else if (name === 'truck') {
      ctx.rect(1, 6, 12, 10); ctx.moveTo(13, 10); ctx.lineTo(18, 10); ctx.lineTo(21, 14); ctx.lineTo(21, 16); ctx.lineTo(13, 16);
      ctx.moveTo(5, 16); ctx.arc(5, 18, 2, -Math.PI, Math.PI); ctx.moveTo(17, 16); ctx.arc(17, 18, 2, -Math.PI, Math.PI);
    } else if (name === 'shield') {
      ctx.moveTo(10, 1); ctx.lineTo(18, 4); ctx.lineTo(17, 13); ctx.quadraticCurveTo(15, 18, 10, 21);
      ctx.quadraticCurveTo(5, 18, 3, 13); ctx.lineTo(2, 4); ctx.closePath(); ctx.moveTo(6, 11); ctx.lineTo(9, 14); ctx.lineTo(15, 7);
    } else if (name === 'leaf') {
      ctx.moveTo(2, 19); ctx.quadraticCurveTo(4, 3, 20, 2); ctx.quadraticCurveTo(19, 16, 5, 18);
      ctx.moveTo(4, 18); ctx.lineTo(15, 7);
    } else if (name === 'heart') {
      ctx.moveTo(10, 20); ctx.bezierCurveTo(7, 16, 1, 12, 1, 7); ctx.bezierCurveTo(1, 1, 8, 1, 10, 6);
      ctx.bezierCurveTo(12, 1, 19, 1, 19, 7); ctx.bezierCurveTo(19, 12, 13, 16, 10, 20);
    }
    ctx.stroke();
    ctx.restore();
  }

  private roundedImage(image: HTMLImageElement, x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.save();
    this.pathRoundedRect(x, y, width, height, radius);
    this.ctx.clip();
    this.fill(x, y, width, height, BRAND.cream);
    const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    this.ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    this.ctx.restore();
  }

  private drawContainedImage(image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
    const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    this.ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  private drawWrappedText(value: string, x: number, y: number, width: number, size: number, lineHeight: number): void {
    this.wrap(value, width, size).slice(0, 4).forEach((line, index) => this.text(line, x, y + index * lineHeight, size));
  }

  private wrap(value: string, width: number, size: number, bold = false): string[] {
    this.ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`;
    const result: string[] = [];
    let line = '';
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const word of value.trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      line = '';
      for (const { segment } of segments.segment(word)) {
        if (line && this.ctx.measureText(line + segment).width > width) {
          result.push(line);
          line = '';
        }
        line += segment;
      }
    }
    if (line) result.push(line);
    return result.length ? result : [''];
  }

  private trackedText(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    spacing: number,
    align: CanvasTextAlign = 'left',
    bold = false,
  ): void {
    this.ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`;
    const widths = [...value].map((character) => this.ctx.measureText(character).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, value.length - 1);
    let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    [...value].forEach((character, index) => {
      this.text(character, cursor, y, size, color, bold);
      cursor += widths[index] + spacing;
    });
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string = BRAND.ink,
    bold = false,
    align: CanvasTextAlign = 'left',
    family = 'Arial, sans-serif',
    italic = false,
  ): void {
    this.ctx.font = `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${size}px ${family}`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.direction = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(value) ? 'rtl' : 'ltr';
    this.ctx.fillText(value, x, y);
  }

  private roundedCard(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
    radius = 8,
  ): void {
    this.ctx.save();
    this.pathRoundedRect(x, y, width, height, radius);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 0.7;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private pathRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, radius);
  }

  private fill(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }
}
