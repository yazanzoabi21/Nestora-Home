import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';

import { CheckoutSelectOption } from '../../models';
import { NgClass } from '@angular/common';
import {
  HostListener,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-checkout-form-field',
  standalone: true,
  imports: [ReactiveFormsModule, ReactiveFormsModule, NgClass],
  templateUrl: './checkout-form-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.col-span-full]': 'fullWidth()',
  },
})
export class CheckoutFormFieldComponent {
  readonly label = input.required<string>();

  readonly control =
    input.required<FormControl<string>>();

  readonly name = input.required<string>();

  readonly type =
    input<'text' | 'email' | 'tel' | 'select'>(
      'text',
    );

  readonly placeholder = input('');

  readonly autocomplete = input('');

  readonly required = input(false);

  readonly disabled = input(false);

  readonly fullWidth = input(false);

  readonly options =
    input<readonly CheckoutSelectOption[]>([]);

  readonly error = input<string | null>(null);

  readonly dropdownOpen = signal(false);

  toggleDropdown(): void {
    if (this.disabled()) {
      return;
    }

    this.dropdownOpen.update((open) => !open);
  }

  selectOption(value: string): void {
    this.control().setValue(value);
    this.control().markAsDirty();
    this.control().markAsTouched();

    this.dropdownOpen.set(false);
  }

  selectedOptionLabel(): string {
    const selectedValue = this.control().value;

    return (
      this.options().find(
        (option) => option.value === selectedValue,
      )?.label ||
      this.placeholder() ||
      ''
    );
  }

  @HostListener('document:click')
  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeDropdownWithEscape(): void {
    this.dropdownOpen.set(false);
  }
}