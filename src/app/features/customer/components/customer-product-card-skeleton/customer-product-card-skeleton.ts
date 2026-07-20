import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-customer-product-card-skeleton',
  standalone: true,
  imports: [SkeletonModule],
  templateUrl: './customer-product-card-skeleton.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProductCardSkeleton {}