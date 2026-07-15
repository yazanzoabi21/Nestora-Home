import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { ADMIN_SUPABASE } from '../../tokens';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient = inject(ADMIN_SUPABASE);
}
