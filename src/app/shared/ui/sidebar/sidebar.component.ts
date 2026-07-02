import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';
import {
  ADMIN_NAVIGATION_SECTIONS,
  AdminNavigationItem,
  AdminNavigationSection,
} from '../../../core/services/navigation/admin-navigation.config';

import { AdminSidebarBadgesService } from '../../../core/services/navigation/admin-sidebar-badges.service';

type OpenSections = Record<string, boolean>;

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;
  @Input() mobileOpen = false;
  @Output() collapsedChange = new EventEmitter<boolean>();
  @Output() mobileClose = new EventEmitter<void>();

  readonly sections = ADMIN_NAVIGATION_SECTIONS;
  readonly openSections = signal<OpenSections>({
    main: true,
    catalogue: true,
    marketing: true,
    operations: true,
    people: true,
    system: true,
    account: true,
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly sidebarBadges = inject(AdminSidebarBadgesService);

  ngOnInit(): void {
    this.openActiveSection(this.router.url);

    void this.sidebarBadges.refreshAll();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.openActiveSection(event.urlAfterRedirects);
      });
  }

  getItemBadge(item: AdminNavigationItem): string | null {
    if (item.badgeKey) {
      return this.sidebarBadges.getBadge(item.badgeKey);
    }

    return item.badge ?? null;
  }

  toggleCollapsed(): void {
    this.collapsedChange.emit(!this.collapsed);
  }

  closeMobile(): void {
    this.mobileClose.emit();
  }

  isCollapsedView(): boolean {
    return this.collapsed && !this.mobileOpen;
  }

  toggleSection(sectionKey: string): void {
    this.openSections.update((sections) => ({
      ...sections,
      [sectionKey]: !sections[sectionKey],
    }));
  }

  isSectionOpen(sectionKey: string): boolean {
    return this.openSections()[sectionKey] ?? false;
  }

  isSectionActive(section: AdminNavigationSection): boolean {
    return section.items.some((item) => this.isRouteActive(item.route));
  }

  private openActiveSection(url: string): void {
    const activeSection = this.sections.find((section) =>
      section.items.some((item) => this.urlMatchesRoute(url, item.route)),
    );

    if (!activeSection) {
      return;
    }

    this.openSections.update((sections) => ({
      ...sections,
      [activeSection.key]: true,
    }));
  }

  private isRouteActive(route: string): boolean {
    return this.urlMatchesRoute(this.router.url, route);
  }

  private urlMatchesRoute(url: string, route: string): boolean {
    return url === route || url.startsWith(`${route}/`);
  }
}
