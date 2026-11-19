import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { OrderEmailVerificationService } from '../services/order-email-verification.service';

@Component({
  selector: 'app-order-email-verification',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './order-email-verification.component.html',
  styleUrl: './order-email-verification.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderEmailVerificationComponent {
  readonly emailVerification = inject(OrderEmailVerificationService);
}
