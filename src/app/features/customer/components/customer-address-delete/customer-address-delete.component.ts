import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { ToastService } from '../../../../core/services/toast.service';
import { AdminFormModalComponent } from '../../../../shared/ui/admin-form-modal';
import { CustomerAddress } from '../../models';
import { CustomerAddressesService } from '../../services';

@Component({
  selector: 'app-customer-address-delete',
  imports: [AdminFormModalComponent, CdkTrapFocus],
  templateUrl: './customer-address-delete.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAddressDeleteComponent {
  private readonly addressBook = inject(CustomerAddressesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly address = signal<CustomerAddress | null>(null);
  readonly deleting = signal(false);
  readonly removed = output<string>();

  open(address: CustomerAddress): void {
    if (!this.deleting()) this.address.set(address);
  }

  cancel(): void {
    if (!this.deleting()) this.address.set(null);
  }

  async confirm(): Promise<void> {
    const address = this.address();
    if (!address || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.addressBook.remove(address.id);
      this.address.set(null);
      this.removed.emit(address.id);
      this.toast.success(this.translate.instant('CUSTOMER.ACCOUNT.ADDRESSES.DELETE_SUCCESS'));
    } catch {
      this.toast.error(this.translate.instant('CUSTOMER.ACCOUNT.ADDRESSES.DELETE_ERROR'));
    } finally {
      this.deleting.set(false);
    }
  }
}
