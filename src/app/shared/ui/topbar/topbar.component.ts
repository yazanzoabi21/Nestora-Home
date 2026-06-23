import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../core/services/translation';
import { UserMenuComponent } from '../user-menu';

export interface TopbarUser {
  name: string;
  role: string;
  initials: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [TranslatePipe, UserMenuComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent {
  readonly translation = inject(TranslationService);

  @Input() user: TopbarUser = {
    name: 'Alex Johnson',
    role: 'Super Admin',
    initials: 'AJ',
  };
  @Input() sidebarCollapsed = false;
  @Output() menuClick = new EventEmitter<void>();

  readonly dateLabel = 'Wednesday, 22 April 2026';
  readonly notificationCount = 3;

  switchLanguage(): void {
    this.translation.toggleLanguage();
  }
}
