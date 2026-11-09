import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { vi, type MockInstance } from 'vitest';
import { ToastService } from '../../../../core/services';
import { CustomerAuthService } from '../../../../core/services/auth';
import { BffApi, BffRequestError } from '../../../../core/services/bff/bff-api';
import { CustomerResetPasswordComponent } from './customer-reset-password.component';

describe('password recovery account confirmation', () => {
  const replace = vi.fn();
  const waitForRecovery = vi.fn();
  const logout = vi.fn();
  let api: MockInstance<BffApi['json']>;

  function create(query: Record<string, string> = { confirmation: 'required' }) {
    TestBed.configureTestingModule({ providers: [FormBuilder,
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: CustomerAuthService, useValue: { waitForPasswordRecoverySession: waitForRecovery, logout } },
      { provide: ToastService, useValue: { success: vi.fn() } },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
      { provide: DOCUMENT, useValue: { defaultView: { location: { replace } } } },
    ] });
    return TestBed.runInInjectionContext(() => new CustomerResetPasswordComponent());
  }
  beforeEach(() => {
    replace.mockReset(); logout.mockReset(); waitForRecovery.mockReset().mockResolvedValue({ user: { id: 'fixture' } });
    api = vi.spyOn(BffApi.prototype, 'json').mockResolvedValue({ email: 'recovery@example.com' });
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('shows the recovery account without submitting confirmation or changing the current session', async () => {
    const component = create();
    await vi.waitFor(() => expect(component.recoveryState()).toBe('confirmation'));
    expect(component.recoveryEmail()).toBe('recovery@example.com');
    expect(api).toHaveBeenCalledExactlyOnceWith('auth/recovery-confirmation');
    expect(waitForRecovery).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });
  it('submits an explicit confirmation and restores a fresh auth context only after success', async () => {
    const component = create();
    await vi.waitFor(() => expect(component.recoveryState()).toBe('confirmation'));
    api.mockResolvedValueOnce({ confirmed: true });
    await component.confirmRecovery();
    expect(api).toHaveBeenLastCalledWith('auth/recovery-confirmation', { confirm: true });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/auth/customer-reset-password');
  });
  it('does not submit confirmation while the confirmation details are still loading', async () => {
    const component = create();
    await component.confirmRecovery();
    expect(api).toHaveBeenCalledTimes(1); expect(replace).not.toHaveBeenCalled();
  });
  it('rejects an expired confirmation without logging out the current account', async () => {
    api.mockRejectedValueOnce(new BffRequestError(400, 'RECOVERY_CONFIRMATION_INVALID'));
    const component = create();
    await vi.waitFor(() => expect(component.recoveryState()).toBe('invalid'));
    expect(logout).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });
  it('keeps the account confirmation available after a transient backend failure', async () => {
    const component = create();
    await vi.waitFor(() => expect(component.recoveryState()).toBe('confirmation'));
    api.mockRejectedValueOnce(new BffRequestError(503, 'SERVICE_UNAVAILABLE'));
    await component.confirmRecovery();
    expect(component.recoveryState()).toBe('confirmation'); expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('AUTH.PASSWORD_RESET.CONFIRMATION_FAILED'); expect(replace).not.toHaveBeenCalled();
  });
  it('retains the existing standalone reset flow', async () => {
    const component = create({});
    await vi.waitFor(() => expect(component.recoveryState()).toBe('ready'));
    expect(waitForRecovery).toHaveBeenCalledOnce(); expect(api).not.toHaveBeenCalled();
  });
  it('does not restore a recovery session for an error callback', () => {
    const component = create({ error: 'authentication_failed' });
    expect(component.recoveryState()).toBe('invalid'); expect(waitForRecovery).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled();
  });
});
