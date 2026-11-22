import { TestBed } from '@angular/core/testing';

import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerAddressRow } from '../models/customer-address.model';
import { CustomerAddressesService } from './customer-addresses.service';

const uid = '10000000-0000-4000-8000-000000000001';
const defaultId = '20000000-0000-4000-8000-000000000001';
const otherId = '20000000-0000-4000-8000-000000000002';
const row: CustomerAddressRow = {
  id: defaultId, user_id: uid, label: 'Home', full_name: 'Customer Example', phone: '70123456',
  street_address: 'Main Road', apartment_or_building: null, city: 'Beirut',
  area_or_district: 'Beirut', country: 'Lebanon', delivery_notes: null, is_default: true,
  created_at: '', updated_at: '',
};

describe('CustomerAddressesService removal', () => {
  const read = vi.fn<() => Promise<{ data: CustomerAddressRow[] | null; error: { message: string } | null }>>();
  const deleteRow = vi.fn<() => Promise<{ data: { id: string } | null; error: { message: string } | null }>>();
  const user = vi.fn<() => Promise<string | null>>();
  const filters = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    const builder = {
      eq: filters,
      delete: vi.fn(),
      select: vi.fn(),
      order: vi.fn(),
      maybeSingle: deleteRow,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => read().then(resolve, reject),
    };
    for (const method of [builder.eq, builder.delete, builder.select, builder.order]) {
      method.mockReturnValue(builder);
    }
    from.mockReturnValue(builder);
    user.mockResolvedValue(uid);
    read.mockResolvedValue({ data: [row], error: null });
    deleteRow.mockResolvedValue({ data: { id: defaultId }, error: null });
    TestBed.configureTestingModule({ providers: [
      { provide: CUSTOMER_SUPABASE, useValue: { from } },
      { provide: CustomerAuthService, useValue: { getCurrentUserId: user } },
    ] });
  });

  it('filters by address and owner, removes the card and reads the promoted default', async () => {
    const service = TestBed.inject(CustomerAddressesService);
    const other = { ...row, id: otherId, is_default: false };
    read.mockResolvedValueOnce({ data: [row, other], error: null });
    await service.load();
    read.mockResolvedValue({ data: [{ ...other, is_default: true }], error: null });
    await service.remove(defaultId);
    expect(filters).toHaveBeenCalledWith('id', defaultId);
    expect(filters).toHaveBeenCalledWith('user_id', uid);
    expect(service.addresses().map((item) => item.id)).toEqual([otherId]);
    await vi.waitFor(() => expect(service.addresses()[0].isDefault).toBe(true));
    await service.load();
    expect(service.addresses().map((item) => item.id)).toEqual([otherId]);
  });

  it('reports a zero-row deletion or network error and keeps the saved address', async () => {
    const service = TestBed.inject(CustomerAddressesService);
    await service.load();
    deleteRow.mockResolvedValueOnce({ data: null, error: null });
    await expect(service.remove(otherId)).rejects.toThrow('could not be deleted');
    deleteRow.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(service.remove(defaultId)).rejects.toThrow('Network unavailable');
    expect(service.addresses().map((item) => item.id)).toEqual([defaultId]);
  });

  it('does not query Supabase when signed out', async () => {
    const service = TestBed.inject(CustomerAddressesService);
    user.mockResolvedValue(null);
    await expect(service.remove(defaultId)).rejects.toThrow('signed in');
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps the last card deleted if reloading the list fails', async () => {
    const service = TestBed.inject(CustomerAddressesService);
    await service.load();
    read.mockResolvedValue({ data: null, error: { message: 'Offline' } });
    await service.remove(defaultId);
    expect(service.addresses()).toEqual([]);
    expect(service.error()).toBeNull();
  });
});
