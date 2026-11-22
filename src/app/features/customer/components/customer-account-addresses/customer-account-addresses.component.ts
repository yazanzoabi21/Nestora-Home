// import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ToastService } from '../../../../core/services/toast.service';
import { CustomerAddress } from '../../models';
import { CustomerAddressesService } from '../../services';
import { CustomerAddressDeleteComponent } from '../customer-address-delete/customer-address-delete.component';
import { CustomerAddressFormComponent } from '../customer-address-form/customer-address-form.component';
import { AdminFormModalComponent } from '../../../../shared/ui/admin-form-modal';

@Component({
  selector: 'app-customer-account-addresses',
  standalone: true,
  imports: [TranslatePipe, CustomerAddressFormComponent, AdminFormModalComponent, CustomerAddressDeleteComponent],
  templateUrl: './customer-account-addresses.component.html',
  styleUrl: './customer-account-addresses.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAccountAddressesComponent {
  readonly addressBook = inject(CustomerAddressesService);
  private readonly toast = inject(ToastService);
  // private readonly document = inject(DOCUMENT);

  readonly editing = signal<CustomerAddress | null | undefined>(undefined);
  readonly saving = signal(false);
  readonly settingDefaultId = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  // ngOnDestroy(): void {
  //   this.unlockScroll();
  // }

  openAdd(): void {
    this.editing.set(null);
  }

  openEdit(address: CustomerAddress): void {
    this.editing.set(address);
  }

  closeForm(): void {
    if (this.saving()) return;
    this.editing.set(undefined)
  }

  async saveAddress(value: Parameters<CustomerAddressesService['create']>[0]): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const editing = this.editing();
      if (editing) {
        await this.addressBook.update(editing.id, value);
        this.toast.updated('Address');
      } else {
        await this.addressBook.create(value);
        this.toast.created('Address');
      }
      this.editing.set(undefined);
    } catch (error) {
      this.toast.failed('Save address', this.message(error));
    } finally {
      this.saving.set(false);
    }
  }

  async setDefault(address: CustomerAddress): Promise<void> {
    if (address.isDefault || this.settingDefaultId()) return;
    this.settingDefaultId.set(address.id);
    try {
      await this.addressBook.setDefault(address.id);
      this.toast.success('Default address updated.');
    } catch (error) {
      this.toast.failed('Set default address', this.message(error));
    } finally {
      this.settingDefaultId.set(null);
    }
  }

  async reload(): Promise<void> {
    try {
      await this.addressBook.load();
    } catch (error) {
      this.toast.failed('Load addresses', this.message(error));
    }
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : 'Please try again.'; }
}
