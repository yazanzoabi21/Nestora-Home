import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Category } from '../../../../data-access/models';
import { CustomerRecentlyViewedEmptyComponent } from './customer-recently-viewed-empty.component';

describe('Recently viewed empty state', () => {
  let fixture: ComponentFixture<CustomerRecentlyViewedEmptyComponent>;
  const category = (id: string, image: string | null = `/assets/${id}.webp`): Category => ({
    id, name: `Category ${id}`, slug: `category-${id}`, image_url: image,
  });
  const element = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerRecentlyViewedEmptyComponent],
      providers: [provideRouter([]), provideTranslateService()],
    }).compileComponents();
    fixture = TestBed.createComponent(CustomerRecentlyViewedEmptyComponent);
  });

  it('limits real category links to three and uses existing routes', async () => {
    fixture.componentRef.setInput('categories', ['a', 'b', 'c', 'd'].map((id) => category(id)));
    await fixture.whenStable();
    const cards = element().querySelectorAll<HTMLAnchorElement>('.empty-category');
    expect(cards.length).toBe(3);
    expect(cards[0].getAttribute('href')).toBe('/shop/products?category=category-a');
    expect(cards[0].textContent).toContain('Category a');
    expect(Array.from(element().querySelectorAll('nav a'), (link) => link.getAttribute('href')))
      .toEqual(['/shop/products', '/shop/best-sellers', '/shop/new-arrivals']);
    expect(element().querySelector('button')).toBeNull();
  });

  it('skips missing images, inactive and unnamed categories without creating placeholders', async () => {
    fixture.componentRef.setInput('categories', [
      category('missing', null), category('blank', ' '),
      { ...category('inactive'), is_active: false },
      { ...category('unnamed'), name: ' ' }, category('available'),
    ]);
    await fixture.whenStable();
    expect(element().querySelectorAll('.empty-category').length).toBe(1);
    expect(element().querySelector('.empty-category')?.textContent).toContain('Category available');
    expect(element().querySelectorAll('img').length).toBe(1);
  });

  it('replaces broken images with the next available category, then gracefully reduces cards', async () => {
    fixture.componentRef.setInput('categories', ['a', 'b', 'c', 'd'].map((id) => category(id)));
    await fixture.whenStable();
    element().querySelector('img')?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(fixture.componentInstance.visibleCategories().map(({ id }) => id)).toEqual(['b', 'c', 'd']);
    element().querySelector('img')?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(element().querySelectorAll('.empty-category').length).toBe(2);
  });

  it('keeps navigation and copy when no categories are available', async () => {
    fixture.componentRef.setInput('categories', []);
    await fixture.whenStable();
    expect(element().querySelectorAll('.empty-category').length).toBe(0);
    expect(element().querySelectorAll('nav a').length).toBe(3);
    expect(element().querySelector('h2')).not.toBeNull();
  });
});
