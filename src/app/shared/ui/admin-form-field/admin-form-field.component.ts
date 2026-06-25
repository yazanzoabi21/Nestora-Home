import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';

export type AdminFormFieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'checkbox'
  | 'select'
  | 'search'
  | 'date'
  | 'file';

export type AdminFormFieldValue = string | number | boolean | Date | File | null;

@Component({
  selector: 'app-admin-form-field',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, TranslatePipe],
  templateUrl: './admin-form-field.component.html',
  styleUrl: './admin-form-field.component.css',
})
export class AdminFormFieldComponent {
  @Input() type: AdminFormFieldType = 'text';
  @Input() name = '';
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value: AdminFormFieldValue = null;
  @Input() min: number | string | null = null;
  @Input() max: number | string | null = null;
  @Input() step: number | string | null = null;
  @Input() required = false;
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() rows = 4;
  @Input() accept = '';
  @Input() options: unknown[] = [];
  @Input() optionLabel: string | undefined;
  @Input() optionValue: string | undefined;
  @Input() filter = false;
  @Input() showClear = false;
  @Input() previewUrl: string | null = null;
  @Input() error: string | null = null;
  @Input() helperText = '';
  @Input() fullWidth = false;
  @Input() colSpan: number | string | null = null;
  @Input() fileName: string | null = null;

  @Output() valueChange = new EventEmitter<AdminFormFieldValue>();
  @Output() fileChange = new EventEmitter<Event>();
  @Output() removeFile = new EventEmitter<void>();

  get hostClasses(): string[] {
    const classes = ['admin-form-field-host'];

    if (this.fullWidth) {
      classes.push('admin-form-field-full');
    }

    if (this.colSpan) {
      classes.push(`admin-form-field-col-${this.colSpan}`);
    }

    return classes;
  }

  get inputType(): 'text' | 'number' | 'search' | 'date' {
    return this.type === 'number' || this.type === 'search' || this.type === 'date' ? this.type : 'text';
  }

  get translatedPlaceholder(): string {
    return this.placeholder ? this.placeholder : '';
  }

  emitValue(value: AdminFormFieldValue): void {
    this.value = value;
    this.valueChange.emit(value);
  }

  emitCheckboxValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.value = input.checked;
    this.valueChange.emit(input.checked);
  }

  emitFileChange(event: Event): void {
    this.fileChange.emit(event);
  }

  optionText(option: unknown): string {
    if (option === null || option === undefined) {
      return '';
    }

    if (this.optionLabel && typeof option === 'object' && this.optionLabel in option) {
      return String((option as Record<string, unknown>)[this.optionLabel] ?? '');
    }

    return String(option);
  }
}
