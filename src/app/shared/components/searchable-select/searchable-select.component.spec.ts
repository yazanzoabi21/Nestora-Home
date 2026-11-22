import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { SearchableSelectComponent, SearchableSelectOption } from './searchable-select.component';

@Component({
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <label id="province-label" for="province">Province</label>
    <app-searchable-select controlId="province" labelId="province-label" [options]="options"
      [formControl]="control" searchLabel="Search provinces" emptyLabel="No results found"
      loadingLabel="Loading…" clearLabel="Clear selection" placeholder="Select a province"
      [loading]="loading" />
    <button id="next" type="button">Next field</button>
  `,
})
class SearchableSelectTestHost {
  readonly control = new FormControl<string | null>('beirut');
  readonly options: SearchableSelectOption[] = [
    { value: 'beirut', label: 'Beirut', keywords: ['بيروت'] },
    { value: 'north', label: 'North', keywords: ['الشمال'] },
    { value: 'bekaa', label: 'Bekaa', keywords: ['البقاع'] },
  ];
  loading = false;
}

function renderSelect() {
  const fixture = TestBed.createComponent(SearchableSelectTestHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const trigger = root.querySelector<HTMLButtonElement>('#province')!;
  const search = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const rows = () => [...root.querySelectorAll<HTMLElement>('[role="option"]')];
  const key = (element: HTMLElement, value: string) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const open = () => {
    trigger.click();
    fixture.detectChanges();
  };
  const filter = (value: string) => {
    search.value = value;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, root, trigger, search, rows, key, open, filter, control: fixture.componentInstance.control };
}

describe('SearchableSelectComponent', () => {
  it('filters immediately by case-insensitive English and Arabic aliases', () => {
    const { open, filter, rows, root, search } = renderSelect();
    open();
    expect(search.getAttribute('aria-expanded')).toBe('true');
    expect(rows().find((row) => row.getAttribute('aria-selected') === 'true')?.textContent?.trim()).toBe('Beirut');
    filter('kAA');
    expect(rows().map((row) => row.textContent?.trim())).toEqual(['Bekaa']);
    expect(rows()[0].querySelector('mark')?.textContent).toBe('kaa');
    filter('بَيْرُوت');
    expect(rows().map((row) => row.textContent?.trim())).toEqual(['Beirut']);
    filter('unknown locality');
    expect(rows()).toHaveLength(0);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('No results found');
  });

  it('supports arrow navigation, selection and clearing with reactive forms', () => {
    const { fixture, control, trigger, search, open, key, rows } = renderSelect();
    key(trigger, 'ArrowDown');
    expect(search.getAttribute('aria-activedescendant')).toBe('province-option-0');
    key(search, 'ArrowDown');
    key(search, 'ArrowDown');
    key(search, 'ArrowUp');
    expect(search.getAttribute('aria-activedescendant')).toBe('province-option-1');
    key(search, 'Enter');
    expect(control.value).toBe('north');
    expect(control.dirty).toBe(true);
    expect(control.touched).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    open();
    rows().find((row) => row.textContent?.trim() === 'Clear selection')!.click();
    fixture.detectChanges();
    expect(control.value).toBeNull();
    expect(trigger.textContent).toContain('Select a province');
  });

  it('closes on Escape, Tab or outside pointer input and resets the search', () => {
    const { fixture, trigger, search, root, open, filter, key, control } = renderSelect();
    open();
    filter('north');
    key(search, 'Escape');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(control.value).toBe('beirut');
    open();
    expect(search.value).toBe('');
    key(search, 'Tab');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    open();
    root.querySelector('#next')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('updates from a form value and respects disabled and loading states', () => {
    const { fixture, trigger, control, open } = renderSelect();
    control.setValue('bekaa');
    fixture.detectChanges();
    expect(trigger.textContent).toContain('Bekaa');
    control.disable();
    fixture.detectChanges();
    expect(trigger.disabled).toBe(true);
    control.enable();
    open();
    fixture.componentInstance.loading = true;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain('Loading');
  });
});
