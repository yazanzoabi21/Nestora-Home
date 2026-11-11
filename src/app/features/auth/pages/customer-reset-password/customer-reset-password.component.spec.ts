import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { CustomerAuthService } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services';
import { CustomerResetPasswordComponent } from './customer-reset-password.component';

describe('direct Supabase password recovery page', () => {
  const waitForRecovery = vi.fn();
  const updatePassword = vi.fn();
  const navigate = vi.fn();
  beforeEach(() => {
    waitForRecovery.mockReset().mockResolvedValue({ user: { id: 'recovery-user' } });
    updatePassword.mockReset().mockResolvedValue(undefined);
    navigate.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerAuthService, useValue: { waitForPasswordRecoverySession: waitForRecovery, updatePasswordFromRecovery: updatePassword } },
      { provide: Router, useValue: { navigate } },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
      { provide: ToastService, useValue: { success: vi.fn() } },
    ] }).overrideComponent(CustomerResetPasswordComponent, { set: { template: '', imports: [] } });
  });
  it('waits for the SDK recovery event before permitting a password update', async () => {
    const component = TestBed.createComponent(CustomerResetPasswordComponent).componentInstance;
    await vi.waitFor(() => expect(component.recoveryState()).toBe('ready'));
    component.form.setValue({ password: 'new-password', confirmPassword: 'new-password' });
    await component.submit();
    expect(updatePassword).toHaveBeenCalledExactlyOnceWith('new-password');
    expect(navigate).toHaveBeenCalledWith(['/auth/customer-login'], { replaceUrl: true });
  });
  it('rejects missing or expired recovery sessions without submitting a password', async () => {
    waitForRecovery.mockResolvedValue(null);
    const component = TestBed.createComponent(CustomerResetPasswordComponent).componentInstance;
    await vi.waitFor(() => expect(component.recoveryState()).toBe('invalid'));
    await component.submit();
    expect(updatePassword).not.toHaveBeenCalled();
  });
  it('keeps recovery retryable after a temporary update failure', async () => {
    updatePassword.mockRejectedValue(new TypeError('Offline'));
    const component = TestBed.createComponent(CustomerResetPasswordComponent).componentInstance;
    await vi.waitFor(() => expect(component.recoveryState()).toBe('ready'));
    component.form.setValue({ password: 'new-password', confirmPassword: 'new-password' });
    await component.submit();
    expect(component.recoveryState()).toBe('ready');
    expect(component.errorMessage()).toBe('AUTH.PASSWORD_RESET.UPDATE_FAILED');
    expect(navigate).not.toHaveBeenCalled();
  });
});
