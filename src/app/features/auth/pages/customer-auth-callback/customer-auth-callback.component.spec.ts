import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { CustomerAuthService } from '../../../../core/services/auth';
import { CustomerShoppingStateService } from '../../../customer/services';
import { CustomerAuthCallbackComponent } from './customer-auth-callback.component';

describe('Customer callback error isolation', () => {
  const complete = vi.fn(); const initialize = vi.fn(); const navigate = vi.fn();
  function create(query: Record<string, string>) {
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: Router, useValue: { navigateByUrl: navigate } },
      { provide: CustomerAuthService, useValue: { completeGoogleSignIn: complete } },
      { provide: CustomerShoppingStateService, useValue: { initialize } },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
    ] });
    return TestBed.runInInjectionContext(() => new CustomerAuthCallbackComponent());
  }
  beforeEach(() => { complete.mockReset().mockResolvedValue('/shop'); initialize.mockReset(); navigate.mockReset(); });
  afterEach(() => TestBed.resetTestingModule());
  it('displays a generic error without invoking failed-login cleanup', () => {
    const component = create({ error: 'authentication_failed' });
    expect(component.errorMessage()).toBe('AUTH.ERRORS.GOOGLE_SIGN_IN_FAILED');
    expect(complete).not.toHaveBeenCalled(); expect(initialize).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it('does not reflect an untrusted error description', () => {
    const component = create({ error_description: 'untrusted callback detail' });
    expect(component.errorMessage()).toBe('AUTH.ERRORS.GOOGLE_SIGN_IN_FAILED'); expect(complete).not.toHaveBeenCalled();
  });
  it('continues the existing successful Google login flow', async () => {
    const component = create({});
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/shop', { replaceUrl: true }));
    expect(component.errorMessage()).toBeNull(); expect(complete).toHaveBeenCalledExactlyOnceWith(); expect(initialize).toHaveBeenCalledOnce();
  });
});
