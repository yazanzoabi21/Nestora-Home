import { Component, Input } from '@angular/core';
import { UserMenuComponent } from '../user-menu';

export interface TopbarUser {
  name: string;
  role: string;
  initials: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [UserMenuComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent {
  @Input() user: TopbarUser = {
    name: 'Alex Johnson',
    role: 'Super Admin',
    initials: 'AJ',
  };

  readonly dateLabel = 'Wednesday, 22 April 2026';
  readonly notificationCount = 3;
}
