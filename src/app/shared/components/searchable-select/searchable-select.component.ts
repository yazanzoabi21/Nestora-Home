import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect,
  forwardRef, inject, input, linkedSignal, output, signal, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchableSelectOption {
  value: string;
  label: string;
  keywords?: readonly string[];
}

interface SelectRow {
  value: string | null;
  label: string;
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\p{M}\u0640]/gu, '').toLowerCase().trim();
}

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SearchableSelectComponent),
    multi: true,
  }],
  host: { class: 'block min-w-0', '(focusout)': 'onFocusOut($event)' },
})
export class SearchableSelectComponent implements ControlValueAccessor {
  readonly controlId = input.required<string>();
  readonly labelId = input.required<string>();
  readonly options = input<readonly SearchableSelectOption[]>([]);
  readonly value = input<string | null>(null);
  readonly valueChange = output<string | null>();
  readonly placeholder = input('');
  readonly searchLabel = input.required<string>();
  readonly emptyLabel = input.required<string>();
  readonly clearLabel = input('');
  readonly loadingLabel = input('');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  readonly opened = signal(false);
  readonly search = signal('');
  readonly activeIndex = signal(-1);

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
  private readonly selected = linkedSignal(() => this.value());
  private readonly formDisabled = signal(false);
  private stopPositioning?: AbortController;
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched = (): void => undefined;

  private readonly indexedOptions = computed(() => this.options().map((option) => ({
    option, terms: [option.label, ...(option.keywords ?? [])].map(normalize),
  })));

  readonly isDisabled = computed(() => this.disabled() || this.loading() || this.formDisabled());
  readonly selectedLabel = computed(() =>
    this.options().find((option) => option.value === this.selected())?.label,
  );
  readonly visibleRows = computed<readonly SelectRow[]>(() => {
    const query = normalize(this.search());
    const rows: SelectRow[] = this.indexedOptions()
      .filter(({ terms }) => !query || terms.some((term) => term.includes(query)))
      .map(({ option }) => option);
    if (!query && this.selectedLabel() && this.clearLabel()) {
      rows.push({ value: null, label: this.clearLabel() });
    }
    return rows;
  });
  readonly activeOptionId = computed(() => this.visibleRows()[this.activeIndex()]
    ? this.optionId(this.activeIndex()) : null);

  constructor() {
    effect(() => {
      if (this.isDisabled() && this.opened()) this.close();
    });
    inject(DestroyRef).onDestroy(() => this.stopPositioning?.abort());
  }

  writeValue(value: string | null): void {
    this.selected.set(value);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  optionId(index: number): string {
    return this.controlId() + '-option-' + index;
  }

  isSelected(row: SelectRow): boolean {
    return row.value !== null && row.value === this.selected();
  }

  toggle(): void {
    if (this.opened()) this.close(true);
    else this.open();
  }

  onTriggerKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    this.open(event.key === 'ArrowUp');
  }

  onSearchKey(event: KeyboardEvent): void {
    if (event.isComposing) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter': {
        event.preventDefault();
        const row = this.visibleRows()[this.activeIndex()];
        if (row) this.choose(row);
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(true);
        break;
    }
  }

  onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget instanceof Node && this.host.contains(event.relatedTarget)) return;
    if (this.opened()) this.close();
    else this.onTouched();
  }

  filter(query: string): void {
    this.search.set(query);
    this.activeIndex.set(this.visibleRows().length ? 0 : -1);
    const list = this.document.getElementById(this.controlId() + '-listbox');
    if (list) list.scrollTop = 0;
  }

  choose(row: SelectRow): void {
    if (this.isDisabled()) return;
    if (row.value !== this.selected()) {
      this.selected.set(row.value);
      this.onChange(row.value);
      this.valueChange.emit(row.value);
    }
    this.close(true);
  }

  highlight(label: string): { before: string; match: string; after: string } {
    const query = this.search().trim();
    const index = query ? label.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (index < 0) return { before: label, match: '', after: '' };
    return {
      before: label.slice(0, index),
      match: label.slice(index, index + query.length),
      after: label.slice(index + query.length),
    };
  }

  private open(fromEnd = false): void {
    if (this.isDisabled() || this.opened()) return;
    this.search.set('');
    const rows = this.visibleRows();
    const selectedIndex = rows.findIndex((row) => this.isSelected(row));
    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : fromEnd ? rows.length - 1 : 0);

    this.opened.set(true);
    const panel = this.panel().nativeElement;
    panel.classList.add('is-open');
    this.positionPanel();
    panel.showPopover?.();
    this.searchInput().nativeElement.focus({ preventScroll: true });
    this.startPositioning();
    this.document.defaultView?.requestAnimationFrame(() => {
      if (this.opened()) this.scrollToActive();
    });
  }

  private close(restoreFocus = false): void {
    if (!this.opened()) return;
    this.opened.set(false);
    const panel = this.panel().nativeElement;
    panel.hidePopover?.();
    panel.classList.remove('is-open');
    this.stopPositioning?.abort();
    this.search.set('');
    this.activeIndex.set(-1);
    this.onTouched();
    if (restoreFocus && !this.isDisabled()) {
      this.trigger().nativeElement.focus({ preventScroll: true });
    }
  }

  private moveActive(delta: number): void {
    const count = this.visibleRows().length;
    if (!count) return;
    const current = this.activeIndex();
    const next = current < 0 ? (delta < 0 ? count - 1 : 0)
      : Math.max(0, Math.min(count - 1, current + delta));
    this.activeIndex.set(next);
    this.scrollToActive();
  }

  private scrollToActive(): void {
    const id = this.activeOptionId();
    if (id) this.document.getElementById(id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private startPositioning(): void {
    const view = this.document.defaultView;
    if (!view) return;
    this.stopPositioning?.abort();
    const controller = new AbortController();
    this.stopPositioning = controller;
    const { signal } = controller;
    let frame = 0;

    const reposition = (event: Event): void => {
      if (event.target instanceof Node && this.panel().nativeElement.contains(event.target)) return;
      if (frame) return;
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        if (this.opened()) this.positionPanel();
      });
    };

    view.addEventListener('resize', reposition, { signal });
    view.addEventListener('scroll', reposition, { capture: true, passive: true, signal });
    view.visualViewport?.addEventListener('resize', reposition, { signal });
    view.visualViewport?.addEventListener('scroll', reposition, { signal });
    this.document.addEventListener('pointerdown', (event) => {
      if (!event.composedPath().includes(this.host)) this.close();
    }, { capture: true, signal });
    signal.addEventListener('abort', () => view.cancelAnimationFrame(frame), { once: true });
  }

  private positionPanel(): void {
    const view = this.document.defaultView;
    if (!view) return;
    const viewport = view.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportHeight = viewport?.height ?? view.innerHeight;
    const viewportWidth = viewport?.width ?? view.innerWidth;
    const trigger = this.trigger().nativeElement;
    const rect = trigger.getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const margin = 8;
    const gap = 6;
    const maxHeight = 288;
    const minAnchoredHeight = 144;
    const top = viewportTop + margin;
    const bottom = viewportTop + viewportHeight - margin;
    const below = bottom - rect.bottom - gap;
    const above = rect.top - gap - top;
    const desired = Math.min(maxHeight, 64 + Math.max(1, this.visibleRows().length) * 44);
    const placeAbove = below < desired && above > below;
    const available = placeAbove ? above : below;
    const anchored = rect.top >= top && rect.bottom <= bottom && available >= Math.min(desired, minAnchoredHeight);
    const width = Math.max(0, Math.min(rect.width, viewportWidth - 2 * margin));
    const idealLeft = view.getComputedStyle(trigger).direction === 'rtl' ? rect.right - width : rect.left;
    const left = Math.min(Math.max(idealLeft, viewportLeft + margin), viewportLeft + viewportWidth - width - margin);

    panel.style.left = left + 'px';
    panel.style.width = width + 'px';
    panel.style.maxHeight = Math.max(0, Math.min(maxHeight, anchored ? available : bottom - top)) + 'px';
    panel.style.top = anchored && placeAbove ? 'auto' : (anchored ? rect.bottom + gap : top) + 'px';
    panel.style.bottom = anchored && placeAbove ? view.innerHeight - rect.top + gap + 'px' : 'auto';
    panel.dataset['placement'] = anchored && placeAbove ? 'above' : 'below';
  }
}
