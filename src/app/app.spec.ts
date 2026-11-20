import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideTranslateService(), MessageService],
    }).compileComponents();
  });

  it('renders the router outlet and global toast host', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('p-toast')).not.toBeNull();
    expect(document.documentElement.lang).toMatch(/^(en|ar)$/);
  });

  it('shows feedback while a guard is pending and clears it when navigation is cancelled', async () => {
    let cancel: (allowed: boolean) => void = () => undefined;
    const gate = new Promise<boolean>((resolve) => { cancel = resolve; });
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'pending', canActivate: [() => gate], children: [] }]);
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl('/pending');
    await Promise.resolve();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-navigation-loading]')).not.toBeNull();
    cancel(false);
    await navigation;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-navigation-loading]')).toBeNull();
  });
});
