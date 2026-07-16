import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
@Component({selector:'app-customer-account-placeholder',standalone:true,templateUrl:'./customer-account-placeholder.component.html',styleUrl:'./customer-account-placeholder.component.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class CustomerAccountPlaceholderComponent { readonly title=inject(ActivatedRoute).snapshot.data['title'] as string; }
