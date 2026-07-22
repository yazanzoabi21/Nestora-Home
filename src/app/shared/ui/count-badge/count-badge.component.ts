import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
} from '@angular/core';

export type CountBadgeTone = 'primary' | 'neutral' | 'danger';
export type CountBadgeSize = 'small' | 'medium';

@Component({
    selector: 'app-count-badge',
    standalone: true,
    template: `
    @if (!hidden()) {
      <span
        class="count-badge"
        [class.count-badge--neutral]="tone() === 'neutral'"
        [class.count-badge--danger]="tone() === 'danger'"
        [class.count-badge--medium]="size() === 'medium'"
        [attr.aria-label]="ariaLabel()"
      >
        {{ displayedValue() }}
      </span>
    }
  `,
    styleUrl: './count-badge.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountBadgeComponent {
    readonly value = input.required<number | string>();
    readonly tone = input<CountBadgeTone>('primary');
    readonly size = input<CountBadgeSize>('small');
    readonly maximum = input(99);
    readonly hideWhenZero = input(true);
    readonly ariaLabel = input<string | null>(null);

    readonly numericValue = computed(() => {
        const parsedValue = Number(this.value());
        return Number.isFinite(parsedValue) ? parsedValue : null;
    });

    readonly hidden = computed(
        () => this.hideWhenZero() && this.numericValue() === 0,
    );

    readonly displayedValue = computed(() => {
        const numericValue = this.numericValue();

        if (numericValue === null) {
            return this.value();
        }

        return numericValue > this.maximum()
            ? `${this.maximum()}+`
            : numericValue;
    });
}