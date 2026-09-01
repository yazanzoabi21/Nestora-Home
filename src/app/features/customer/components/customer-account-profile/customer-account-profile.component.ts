import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthenticatedUserProfile } from '../../../../core/models/auth';
import { CustomerAuthService } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { splitFullName } from '../../../../shared/utils/name.util';
import { prepareAvatarImage } from '../../../../shared/utils/avatar-upload.util';

interface CustomerProfileFormValue { firstName: string; lastName: string; email: string; phone: string; birthday: string; }

@Component({
  selector: 'app-customer-account-profile', standalone: true, imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './customer-account-profile.component.html', styleUrl: './customer-account-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAccountProfileComponent implements OnDestroy {
  readonly auth = inject(CustomerAuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly selectedAvatarFile = signal<File | null>(null);
  readonly avatarPreviewUrl = signal<string | null>(null);
  readonly mobileEditing = signal(false);
  readonly profile = this.auth.customerProfile;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly fullName = computed(() => this.profile()?.full_name?.trim() || this.auth.displayName());
  readonly profileEmail = computed(() => this.profile()?.email || this.auth.user()?.email || null);
  readonly phone = computed(() => this.profile()?.phone?.trim() || null);
  readonly memberSince = computed(() => {
    const createdAt = this.profile()?.created_at;
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  });
  readonly form = this.fb.nonNullable.group({
    firstName: ['', [trimmedRequired(), Validators.maxLength(60)]],
    lastName: ['', [trimmedRequired(), Validators.maxLength(60)]],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.maxLength(30), practicalPhone()]],
    birthday: ['', [notFutureDate()]],
  });
  private readonly original = signal<CustomerProfileFormValue>(emptyFormValue());
  private readonly current = signal<CustomerProfileFormValue>(emptyFormValue());
  private readonly formRevision = signal(0);
  readonly displayedAvatarUrl = computed(() => this.avatarPreviewUrl() ?? this.profile()?.avatar_url ?? null);
  readonly hasChanges = computed(() => !sameProfileValues(this.current(), this.original()) || !!this.selectedAvatarFile());
  readonly canSave = computed(() => { this.formRevision(); return this.hasChanges() && this.form.valid && !this.saving(); });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.current.set(this.form.getRawValue()); this.formRevision.update((revision) => revision + 1); });
    effect(() => {
      const profile = this.profile();
      const userEmail = this.auth.user()?.email;

      if (profile && !this.saving()) this.resetToProfile(profile, userEmail);
    });
  }

  clearEdit(): void {
    if (!this.hasChanges() || this.saving()) return;
    this.clearAvatarSelection();
    this.resetForm(this.original());
  }

  beginMobileEdit(): void {
    this.mobileEditing.set(true);
  }

  cancelMobileEdit(): void {
    if (this.saving()) return;
    this.clearAvatarSelection();
    const profile = this.profile();
    if (profile) this.resetToProfile(profile, this.auth.user()?.email);
    this.mobileEditing.set(false);
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.saving()) return;
    try {
      const prepared = await prepareAvatarImage(file);
      this.clearAvatarSelection();
      this.selectedAvatarFile.set(prepared);
      this.avatarPreviewUrl.set(URL.createObjectURL(prepared));
    } catch (error) {
      this.toast.warn('Invalid avatar', error instanceof Error ? error.message : 'Unable to process avatar image.');
    }
  }

  async saveChanges(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    if (this.form.invalid || !this.hasChanges()) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const value = this.form.getRawValue();
    try {
      const selectedAvatar = this.selectedAvatarFile();
      const avatarUrl = selectedAvatar
        ? await this.auth.uploadCurrentUserAvatar(selectedAvatar)
        : this.profile()?.avatar_url ?? null;
      const saved = await this.auth.updateProfile({
        full_name: `${value.firstName.trim()} ${value.lastName.trim()}`.trim(),
        phone: value.phone.trim() || null,
        birthday: value.birthday || null,
        avatar_url: avatarUrl,
        avatar_media_id: selectedAvatar ? null : this.profile()?.avatar_media_id ?? null,
      });
      this.clearAvatarSelection();
      this.resetToProfile(saved, this.auth.user()?.email);
      this.mobileEditing.set(false);
      this.toast.updated('Profile');
    } catch (error) {
      this.toast.failed('Profile update', error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally { this.saving.set(false); }
  }

  showError(control: AbstractControl): boolean { return control.invalid && (control.touched || this.submitted()); }
  ngOnDestroy(): void { this.clearAvatarSelection(); }
  private clearAvatarSelection(): void {
    const previewUrl = this.avatarPreviewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    this.avatarPreviewUrl.set(null);
    this.selectedAvatarFile.set(null);
  }
  private resetToProfile(profile: AuthenticatedUserProfile, email?: string): void {
    const names = splitFullName(profile.full_name ?? this.auth.displayName());
    const value: CustomerProfileFormValue = { firstName: names.firstName, lastName: names.lastName, email: email ?? profile.email ?? '', phone: profile.phone ?? '', birthday: profile.birthday ?? '' };
    this.original.set(value); this.resetForm(value);
  }
  private resetForm(value: CustomerProfileFormValue): void {
    this.form.reset(value, { emitEvent: false }); this.form.markAsPristine(); this.form.markAsUntouched(); this.submitted.set(false); this.current.set({ ...value });
  }
}

function trimmedRequired(): ValidatorFn { return (control): ValidationErrors | null => typeof control.value === 'string' && control.value.trim() ? null : { required: true }; }
function practicalPhone(): ValidatorFn { return (control): ValidationErrors | null => !control.value || /^[+\d][\d\s().-]{5,29}$/.test(String(control.value).trim()) ? null : { phone: true }; }
function notFutureDate(): ValidatorFn { return (control): ValidationErrors | null => !control.value || String(control.value) <= new Date().toISOString().slice(0, 10) ? null : { futureDate: true }; }
function emptyFormValue(): CustomerProfileFormValue { return { firstName: '', lastName: '', email: '', phone: '', birthday: '' }; }
function sameProfileValues(a: CustomerProfileFormValue, b: CustomerProfileFormValue): boolean { return a.firstName.trim() === b.firstName.trim() && a.lastName.trim() === b.lastName.trim() && a.email === b.email && a.phone.trim() === b.phone.trim() && a.birthday === b.birthday; }
