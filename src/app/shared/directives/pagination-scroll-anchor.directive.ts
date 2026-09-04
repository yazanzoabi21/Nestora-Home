import { AfterRenderRef, Directive, ElementRef, Injector, afterNextRender, inject } from '@angular/core';

@Directive({
  selector: '[appPaginationScrollAnchor]',
  standalone: true,
  exportAs: 'paginationScrollAnchor',
})
export class PaginationScrollAnchorDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private pendingScroll: AfterRenderRef | null = null;

  scrollAfterNextRender(): void {
    this.pendingScroll?.destroy();
    this.pendingScroll = afterNextRender(
      {
        write: () => {
          this.pendingScroll = null;
          this.element.nativeElement.scrollIntoView({
            behavior: 'auto',
            block: 'start',
          });
        },
      },
      { injector: this.injector },
    );
  }
}
