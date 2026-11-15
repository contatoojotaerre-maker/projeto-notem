// Server-side guard shared by panel server functions that may read with the service role.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
/** The signed-in caller must belong to the organization or be a platform admin; any lookup error refuses. */
export async function requireOrgMember(supabase: SupabaseClient<Database>, organization_id: string, message = 'Acesso não autorizado.') {
  const [admin, member] = await Promise.all([supabase.rpc('is_platform_admin'), supabase.rpc('is_org_member', { org_id: organization_id })]);
  if (admin.error || member.error || (admin.data !== true && member.data !== true)) throw new Error(message);
}
