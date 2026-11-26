import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';

import { CustomerNewsletterService } from '../../services/customer-newsletter.service';
import { CustomerFooterComponent } from './customer-footer.component';

describe('CustomerFooterComponent newsletter submission', () => {
  const subscribe = vi.fn();
  let component: CustomerFooterComponent;

  beforeEach(() => {
    subscribe.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ imports: [CustomerFooterComponent], providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en' }),
      { provide: CustomerNewsletterService, useValue: { subscribe } },
    ] });
    component = TestBed.runInInjectionContext(() => new CustomerFooterComponent());
  });

  it.each(['reader@example.com', 'invalid'])('prevents navigation when the rendered form submits %s', async (email) => {
    const fixture = TestBed.createComponent(CustomerFooterComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[type="email"]')!;
    const form = root.querySelector<HTMLFormElement>('form')!;
    input.value = email;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    if (email === 'reader@example.com') {
      expect(subscribe).toHaveBeenCalledExactlyOnceWith(email);
      expect(fixture.componentInstance.status()).toBe('success');
    } else {
      expect(subscribe).not.toHaveBeenCalled();
      expect(fixture.componentInstance.email.invalid).toBe(true);
      expect(fixture.componentInstance.email.touched).toBe(true);
    }
    expect(root.querySelector('#newsletter-feedback')?.textContent?.trim()).toBeTruthy();
  });

  it('rejects empty, malformed and overlong addresses before sending', async () => {
    for (const value of ['', 'invalid', 'reader@localhost', 'a'.repeat(255) + '@example.com']) {
      component.email.setValue(value);
      await component.subscribe();
      expect(component.email.invalid).toBe(true);
      expect(component.email.touched).toBe(true);
    }
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('prevents concurrent submits and clears the email only after saving', async () => {
    let finish: (() => void) | undefined;
    subscribe.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    component.email.setValue('  reader@example.com  ');
    const pending = component.subscribe();
    expect(component.submitting()).toBe(true);
    expect(component.email.disabled).toBe(true);
    await component.subscribe();
    expect(subscribe).toHaveBeenCalledExactlyOnceWith('reader@example.com');
    expect(component.status()).toBe('idle');
    finish?.();
    await pending;
    expect(component.status()).toBe('success');
    expect(component.email.value).toBe('');
    expect(component.email.enabled).toBe(true);
    expect(component.submitting()).toBe(false);
  });

  it('keeps the email on failure and allows retry', async () => {
    subscribe.mockRejectedValueOnce(new Error('offline'));
    component.email.setValue('reader@example.com');
    await component.subscribe();
    expect(component.status()).toBe('error');
    expect(component.email.value).toBe('reader@example.com');
    expect(component.submitting()).toBe(false);
    expect(component.email.enabled).toBe(true);
    await component.subscribe();
    expect(component.status()).toBe('success');
  });
});
