import { Component } from '@angular/core';

interface ProfileSummaryItem {
  icon: string;
  value: string;
}

interface FieldItem {
  label: string;
  value: string;
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

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent {
  readonly profileSummary = {
    initials: 'AJ',
    name: 'Alex Johnson',
    role: 'Super Admin',
    status: 'Active',
    details: [
      {
        icon: 'pi pi-envelope',
        value: 'alex.johnson@nestora.co.uk',
      },
      {
        icon: 'pi pi-phone',
        value: '+44 7700 900123',
      },
      {
        icon: 'pi pi-map-marker',
        value: 'London, United Kingdom',
      },
      {
        icon: 'pi pi-calendar',
        value: 'Joined 14 Mar 2023',
      },
    ] satisfies ProfileSummaryItem[],
  };

  readonly personalFields: FieldItem[] = [
    {
      label: 'First Name',
      value: 'Alex',
    },
    {
      label: 'Last Name',
      value: 'Johnson',
    },
    {
      label: 'Email Address',
      value: 'alex.johnson@nestora.co.uk',
    },
    {
      label: 'Phone Number',
      value: '+44 7700 900123',
    },
    {
      label: 'Job Title',
      value: 'Super Admin',
    },
    {
      label: 'Location',
      value: 'London, United Kingdom',
      hasChevron: true,
    },
  ];

  readonly securityFields: FieldItem[] = [
    {
      label: 'Username',
      value: 'alex.johnson',
    },
    {
      label: 'Password',
      value: '••••••••••••••',
    },
  ];

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
    device: 'MacBook Pro • Chrome • London, UK',
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
      date: '22 Apr 2026, 10:32 AM',
      status: 'Success',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
    {
      title: 'Logged in from new device',
      date: '22 Apr 2026, 09:15 AM',
      status: 'Info',
      badgeClass: 'bg-[#edf4ff] text-[#4f7dbd]',
    },
    {
      title: 'Updated profile information',
      date: '20 Apr 2026, 04:50 PM',
      status: 'Success',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
    {
      title: 'Enabled two-factor authentication',
      date: '18 Apr 2026, 11:20 AM',
      status: 'Success',
      badgeClass: 'bg-[#eef4e8] text-[#5f6f43]',
    },
    {
      title: 'Logged in',
      date: '18 Apr 2026, 09:08 AM',
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
}
