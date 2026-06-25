import { NgClass } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type AdminFormModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type AdminFormModalVariant = 'form' | 'delete';

@Component({
  selector: 'app-admin-form-modal',
  standalone: true,
  imports: [NgClass, TranslatePipe],
  templateUrl: './admin-form-modal.component.html',
  styleUrl: './admin-form-modal.component.css',
})
export class AdminFormModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() message = '';
  @Input() size: AdminFormModalSize = 'md';
  @Input() variant: AdminFormModalVariant = 'form';

  @Input() submitLabel = 'COMMON.SAVE';
  @Input() cancelLabel = 'COMMON.CANCEL';
  @Input() loading = false;

  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.isOpen) {
      this.close.emit();
    }
  }

  sizeClass(): string {
    if (this.variant === 'delete') {
      return 'max-w-md';
    }

    switch (this.size) {
      case 'sm':
        return 'max-w-md';
      case 'lg':
        return 'max-w-3xl';
      case 'xl':
        return 'max-w-5xl';
      case 'md':
      default:
        return 'max-w-2xl';
    }
  }

  isDeleteModal(): boolean {
    return this.variant === 'delete';
  }

  submitButtonClass(): string {
    return this.isDeleteModal()
      ? 'admin-modal-delete-button'
      : 'admin-modal-submit-button';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}