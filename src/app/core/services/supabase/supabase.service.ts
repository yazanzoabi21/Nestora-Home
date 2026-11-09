import { Injectable, inject } from '@angular/core';
import type { NestoraSupabaseClient } from '../../models/auth/browser-auth.models';

import { ADMIN_SUPABASE } from '../../tokens';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: NestoraSupabaseClient = inject(ADMIN_SUPABASE);
}
