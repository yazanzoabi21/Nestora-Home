import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type AdminFormModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type AdminFormModalVariant = 'form' | 'delete';

@Component({
  selector: 'app-admin-form-modal',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-form-modal.component.html',
  styleUrl: './admin-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFormModalComponent implements OnChanges, OnDestroy {
  private static readonly baseZIndex = 10000;
  private static openModalCount = 0;
  private static readonly openModals: AdminFormModalComponent[] = [];
  private scrollLocked = false;
  zIndex = AdminFormModalComponent.baseZIndex;
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() message = '';
  @Input() size: AdminFormModalSize = 'md';
  @Input() variant: AdminFormModalVariant = 'form';

  @Input() submitLabel = 'COMMON.SAVE';
  @Input() cancelLabel = 'COMMON.CANCEL';
  @Input() loading = false;

  // Keep the reusable modal API aligned with its existing consumers.
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() close = new EventEmitter<void>();
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() submit = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) this.lockBodyScroll();
      else this.unlockBodyScroll();
    }
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    if (this.scrollLocked || typeof document === 'undefined') return;
    this.scrollLocked = true;
    AdminFormModalComponent.openModals.push(this);
    this.zIndex =
      AdminFormModalComponent.baseZIndex +
      (AdminFormModalComponent.openModals.length - 1) * 10;
    AdminFormModalComponent.openModalCount += 1;
    if (AdminFormModalComponent.openModalCount === 1) {
      document.body.dataset['adminModalOverflow'] = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  }

  private unlockBodyScroll(): void {
    if (!this.scrollLocked || typeof document === 'undefined') return;
    this.scrollLocked = false;
    const modalIndex = AdminFormModalComponent.openModals.indexOf(this);
    if (modalIndex >= 0) {
      AdminFormModalComponent.openModals.splice(modalIndex, 1);
    }
    AdminFormModalComponent.openModalCount = Math.max(
      0,
      AdminFormModalComponent.openModalCount - 1,
    );
    if (AdminFormModalComponent.openModalCount === 0) {
      document.body.style.overflow = document.body.dataset['adminModalOverflow'] ?? '';
      delete document.body.dataset['adminModalOverflow'];
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.isOpen && this.isTopmostModal()) {
      this.close.emit();
    }
  }

  private isTopmostModal(): boolean {
    return AdminFormModalComponent.openModals.at(-1) === this;
  }

  isDeleteModal(): boolean {
    return this.variant === 'delete';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  onBackdropKeydown(event: KeyboardEvent): void {
    if (
      event.target === event.currentTarget &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      this.close.emit();
    }
  }
}
