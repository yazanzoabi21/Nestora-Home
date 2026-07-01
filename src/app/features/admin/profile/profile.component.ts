import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { AppRoleName, AuthenticatedUserProfile, CurrentUserProfileUpdate } from '../../../core/models/auth';
import { ToastService } from '../../../core/services';
import { AuthService } from '../../../core/services/auth';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';

interface ProfileSummaryItem {
  icon: string;
  value: string;
}

interface ProfileSummary {
  initials: string;
  name: string;
  role: string;
  status: string;
  avatarUrl: string | null;
  details: ProfileSummaryItem[];
}

type ProfileFormKey = 'firstName' | 'lastName' | 'email' | 'phone' | 'jobTitle' | 'location';

interface ProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  location: string;
  avatarUrl: string | null;
}

interface FieldItem {
  key: ProfileFormKey;
  label: string;
  value: string;
  placeholder: string;
  inputType?: string;
  hasChevron?: boolean;
}

interface PreferenceItem {
  label: string;
  value: string;
}

interface ToggleItem {
  label: string;
  description: string;
  enabled: boolean;
}

interface ActivityItem {
  title: string;
  date: string;
  status: 'Success' | 'Info';
  badgeClass: string;
}

interface DangerAction {
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  buttonClass: string;
}

const EMPTY_FORM_STATE: ProfileFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  location: '',
  avatarUrl: null,
};

const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_AVATAR_URL = 'assets/images/default-avatar.svg';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [AdminFormModalComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly loadedProfile = signal<AuthenticatedUserProfile | null>(null);
  readonly originalFormState = signal<ProfileFormState>(cloneFormState(EMPTY_FORM_STATE));
  readonly formState = signal<ProfileFormState>(cloneFormState(EMPTY_FORM_STATE));
  readonly selectedAvatarFile = signal<File | null>(null);
  readonly avatarPreviewUrl = signal<string | null>(null);
  readonly isAvatarPreviewOpen = signal(false);
  readonly isClearPhotoModalOpen = signal(false);
  readonly avatarImageFailed = signal(false);

  readonly isDirty = computed(() => {
    return !areFormStatesEqual(this.originalFormState(), this.formState()) || !!this.selectedAvatarFile();
  });

  readonly canSave = computed(() => this.isDirty() && !this.isLoading() && !this.isSaving());

  readonly hasPreviewableCustomAvatar = computed(() => !!this.formState().avatarUrl && !this.avatarImageFailed());

  readonly canClearPhoto = computed(() => !!this.formState().avatarUrl && !this.avatarImageFailed());

  readonly profileSummary = computed<ProfileSummary>(() => {
    const profile = this.loadedProfile();
    const form = this.formState();
    const fullName = combineFullName(form.firstName, form.lastName);
    const email = form.email || profile?.email || '';
    const name = fullName || getNameFromEmail(email) || (this.isLoading() ? 'Loading user' : 'Not provided');
    const avatarUrl = this.avatarPreviewUrl() || form.avatarUrl || DEFAULT_AVATAR_URL;

    return {
      initials: getInitials(fullName || email),
      name,
      role: profile ? formatRoleName(profile.roles?.name) : this.isLoading() ? 'Loading' : 'Not provided',
      status: profile ? (profile.is_active ? 'Active' : 'Inactive') : this.isLoading() ? 'Loading' : 'Not provided',
      avatarUrl,
      details: [
        {
          icon: 'pi pi-envelope',
          value: email || (this.isLoading() ? 'Loading' : 'Not provided'),
        },
        {
          icon: 'pi pi-phone',
          value: getProvidedValue(form.phone),
        },
        {
          icon: 'pi pi-map-marker',
          value: getProvidedValue(form.location),
        },
        {
          icon: 'pi pi-calendar',
          value: `Joined ${profile ? formatJoinedDate(profile.created_at) : 'Not provided'}`,
        },
      ],
    };
  });

  readonly personalFields = computed<FieldItem[]>(() => {
    const form = this.formState();

    return [
      {
        key: 'firstName',
        label: 'First Name',
        value: form.firstName,
        placeholder: 'Not provided',
      },
      {
        key: 'lastName',
        label: 'Last Name',
        value: form.lastName,
        placeholder: 'Not provided',
      },
      {
        key: 'email',
        label: 'Email Address',
        value: form.email,
        placeholder: 'Not provided',
        inputType: 'email',
      },
      {
        key: 'phone',
        label: 'Phone Number',
        value: form.phone,
        placeholder: 'Not provided',
        inputType: 'tel',
      },
      {
        key: 'jobTitle',
        label: 'Job Title',
        value: form.jobTitle,
        placeholder: 'Not provided',
      },
      {
        key: 'location',
        label: 'Location',
        value: form.location,
        placeholder: 'Not provided',
        hasChevron: true,
      },
    ];
  });

  readonly securityFields = computed(() => {
    const email = this.formState().email;

    return [
      {
        label: 'Username',
        value: getNameFromEmail(email) || 'Not provided',
      },
      {
        label: 'Password',
        value: '**************',
      },
    ];
  });

  readonly securityToggles: ToggleItem[] = [
    {
      label: 'Two-Factor Authentication',
      description: 'Add an extra layer of security to your account.',
      enabled: true,
    },
    {
      label: 'Login Verification',
      description: 'Verify new logins via email or app for added security.',
      enabled: true,
    },
  ];

  readonly activeSession = {
    device: 'Current browser session',
    badge: 'Current Session',
  };

  readonly preferences: PreferenceItem[] = [
    {
      label: 'Language',
      value: 'English (UK)',
    },
    {
      label: 'Theme',
      value: 'Light',
    },
    {
      label: 'Time Zone',
      value: 'GMT+0 London',
    },
    {
      label: 'Date Format',
      value: 'DD/MM/YYYY',
    },
    {
      label: 'Currency',
      value: 'USD ($)',
    },
  ];

  readonly preferenceToggles: ToggleItem[] = [
    {
      label: 'Email Notifications',
      description: 'Receive email updates about your account.',
      enabled: true,
    },
    {
      label: 'SMS Alerts',
      description: 'Receive important alerts via SMS.',
      enabled: false,
    },
  ];

  readonly activities: ActivityItem[] = [
    {
      title: 'Password changed',
      date: 'Not provided',
      status: 'Info',
      badgeClass: 'bg-[#edf4ff] text-[#4f7dbd]',
    },
    {
      title: 'Logged in from current device',
      date: 'Not provided',
      status: 'Info',
      badgeClass: 'bg-[#edf4ff] text-[#4f7dbd]',
    },
    {
      title: 'Updated profile information',
      date: 'Not provided',
      status: 'Info',
      badgeClass: 'bg-[#edf4ff] text-[#4f7dbd]',
    },
  ];

  readonly dangerActions: DangerAction[] = [
    {
      icon: 'pi pi-download',
      title: 'Download My Data',
      description: 'Download a copy of your data.',
      buttonLabel: 'Download',
      buttonClass: 'border-[#e5ded2] text-[#342f29] hover:bg-[#f7f4ef]',
    },
    {
      icon: 'pi pi-power-off',
      title: 'Deactivate Account',
      description: 'Temporarily disable your account.',
      buttonLabel: 'Deactivate',
      buttonClass: 'border-[#e5ded2] text-[#342f29] hover:bg-[#f7f4ef]',
    },
    {
      icon: 'pi pi-trash',
      title: 'Delete Account',
      description: 'Permanently delete your account and all data.',
      buttonLabel: 'Delete',
      buttonClass: 'border-[#f1b9b4] text-[#dc3f35] hover:bg-[#fff1f0]',
    },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
  }

  @HostListener('document:keydown.escape')
  closeAvatarPreviewOnEscape(): void {
    this.closeAvatarPreview();
  }

  updateField(key: ProfileFormKey, value: string): void {
    this.formState.update((state) => ({
      ...state,
      [key]: value,
    }));
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Please select a valid image file.');
      this.toast.warn('Invalid avatar', 'Please select a valid image file.');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      this.errorMessage.set('Avatar image must be 10 MB or smaller.');
      this.toast.warn('Avatar too large', 'Avatar image must be 10 MB or smaller.');
      return;
    }

    this.revokeAvatarPreview();
    this.selectedAvatarFile.set(file);
    this.avatarPreviewUrl.set(URL.createObjectURL(file));
    this.avatarImageFailed.set(false);
    this.errorMessage.set(null);
  }

  openClearPhotoModal(): void {
    if (!this.canClearPhoto() || this.isLoading() || this.isSaving()) {
      return;
    }

    this.isClearPhotoModalOpen.set(true);
  }

  closeClearPhotoModal(): void {
    if (!this.isSaving()) {
      this.isClearPhotoModalOpen.set(false);
    }
  }

  async confirmClearPhoto(): Promise<void> {
    await this.clearAvatar();
  }

  private async clearAvatar(): Promise<void> {
    if (!this.canClearPhoto() || this.isLoading() || this.isSaving()) {
      this.isClearPhotoModalOpen.set(false);
      return;
    }

    const previousFormState = cloneFormState(this.formState());
    const previousOriginalState = cloneFormState(this.originalFormState());
    const previousProfile = this.loadedProfile();
    const previousSelectedAvatar = this.selectedAvatarFile();
    const previousPreviewUrl = this.avatarPreviewUrl();
    const previousImageFailed = this.avatarImageFailed();

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.selectedAvatarFile.set(null);
    this.avatarPreviewUrl.set(null);
    this.avatarImageFailed.set(false);
    this.formState.update((state) => ({
      ...state,
      avatarUrl: null,
    }));

    try {
      const savedProfile = await this.authService.updateCurrentUserProfile({
        avatar_url: null,
      });
      const savedOriginalState = toFormState(savedProfile);

      this.loadedProfile.set(savedProfile);
      this.originalFormState.set(savedOriginalState);
      this.formState.update((state) => ({
        ...state,
        avatarUrl: null,
      }));

      if (previousPreviewUrl) {
        URL.revokeObjectURL(previousPreviewUrl);
      }

      this.toast.updated('Profile photo');
      this.isClearPhotoModalOpen.set(false);
    } catch (error) {
      this.loadedProfile.set(previousProfile);
      this.originalFormState.set(previousOriginalState);
      this.formState.set(previousFormState);
      this.selectedAvatarFile.set(previousSelectedAvatar);
      this.avatarPreviewUrl.set(previousPreviewUrl);
      this.avatarImageFailed.set(previousImageFailed);

      const message = error instanceof Error ? error.message : 'Unable to clear profile photo.';
      this.errorMessage.set(message);
      this.toast.failed('Clearing profile photo', message);
    } finally {
      this.isSaving.set(false);
    }
  }

  openAvatarPreview(): void {
    if (this.hasPreviewableCustomAvatar()) {
      this.isAvatarPreviewOpen.set(true);
    }
  }

  closeAvatarPreview(): void {
    this.isAvatarPreviewOpen.set(false);
  }

  avatarSrc(): string {
    return this.avatarImageFailed() ? DEFAULT_AVATAR_URL : this.profileSummary().avatarUrl || DEFAULT_AVATAR_URL;
  }

  onAvatarError(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.avatarImageFailed.set(true);
    this.isAvatarPreviewOpen.set(false);
    image.src = DEFAULT_AVATAR_URL;
  }

  clearEdit(): void {
    if (!this.isDirty() || this.isSaving()) {
      return;
    }

    this.revokeAvatarPreview();
    this.selectedAvatarFile.set(null);
    this.formState.set(cloneFormState(this.originalFormState()));
    this.errorMessage.set(null);
    this.avatarImageFailed.set(false);
  }

  async saveChanges(): Promise<void> {
    if (!this.canSave()) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    try {
      const currentForm = this.formState();
      let avatarUrl = currentForm.avatarUrl;

      if (this.selectedAvatarFile()) {
        avatarUrl = await this.authService.uploadCurrentUserAvatar(this.selectedAvatarFile() as File);
      }

      const savedProfile = await this.authService.updateCurrentUserProfile({
        full_name: emptyToNull(combineFullName(currentForm.firstName, currentForm.lastName)),
        email: currentForm.email.trim(),
        phone: emptyToNull(currentForm.phone),
        avatar_url: avatarUrl,
      } satisfies CurrentUserProfileUpdate);

      const savedForm = {
        ...currentForm,
        avatarUrl,
      };

      this.loadedProfile.set(savedProfile);
      this.originalFormState.set(cloneFormState(savedForm));
      this.formState.set(cloneFormState(savedForm));
      this.revokeAvatarPreview();
      this.selectedAvatarFile.set(null);
      this.avatarImageFailed.set(false);
      this.toast.updated('Profile');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save profile.';
      this.errorMessage.set(message);
      this.toast.failed('Saving profile', message);
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const profile = await this.authService.getCurrentUserProfile();

      if (!profile || !profile.is_active) {
        await this.authService.logout();
        return;
      }

      this.applyProfile(profile);
      this.errorMessage.set(null);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load profile.');
      this.applyErrorState();
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyProfile(profile: AuthenticatedUserProfile): void {
    const formState = toFormState(profile);

    this.loadedProfile.set(profile);
    this.originalFormState.set(cloneFormState(formState));
    this.formState.set(cloneFormState(formState));
    this.revokeAvatarPreview();
    this.selectedAvatarFile.set(null);
    this.avatarImageFailed.set(false);
  }

  private applyErrorState(): void {
    this.loadedProfile.set(null);
    this.originalFormState.set(cloneFormState(EMPTY_FORM_STATE));
    this.formState.set(cloneFormState(EMPTY_FORM_STATE));
    this.revokeAvatarPreview();
    this.selectedAvatarFile.set(null);
    this.avatarImageFailed.set(false);
  }

  private revokeAvatarPreview(): void {
    const previewUrl = this.avatarPreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.avatarPreviewUrl.set(null);
    }
  }
}

function toFormState(profile: AuthenticatedUserProfile): ProfileFormState {
  const fullNameParts = getFullNameParts(profile.full_name);

  return {
    firstName: fullNameParts.firstName,
    lastName: fullNameParts.lastName,
    email: profile.email,
    phone: profile.phone?.trim() ?? '',
    // These fields are UI-only until matching columns exist in profiles.
    jobTitle: formatRoleName(profile.roles?.name),
    location: '',
    avatarUrl: profile.avatar_url,
  };
}

function cloneFormState(state: ProfileFormState): ProfileFormState {
  return {
    ...state,
  };
}

function areFormStatesEqual(first: ProfileFormState, second: ProfileFormState): boolean {
  return (
    first.firstName.trim() === second.firstName.trim() &&
    first.lastName.trim() === second.lastName.trim() &&
    first.email.trim() === second.email.trim() &&
    first.phone.trim() === second.phone.trim() &&
    first.jobTitle.trim() === second.jobTitle.trim() &&
    first.location.trim() === second.location.trim() &&
    first.avatarUrl === second.avatarUrl
  );
}

function getFullNameParts(fullName: string | null): { firstName: string; lastName: string } {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (!parts.length) {
    return {
      firstName: '',
      lastName: '',
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function combineFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

function getInitials(value: string): string {
  const cleanValue = value.trim();

  if (!cleanValue) {
    return '?';
  }

  const parts = cleanValue.includes('@')
    ? [cleanValue.split('@')[0]]
    : cleanValue.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getNameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}

function getProvidedValue(value: string | null): string {
  return value?.trim() || 'Not provided';
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function formatRoleName(roleName: AppRoleName | undefined): string {
  switch (roleName) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'customer':
      return 'Customer';
    default:
      return 'Not provided';
  }
}

function formatJoinedDate(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'Not provided';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
