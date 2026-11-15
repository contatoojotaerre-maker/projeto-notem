import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getLayoutStatus = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { readLayoutStatus } = await import('./platform-settings-admin.server');
  return readLayoutStatus(context.supabase);
});
export const updateNt009Start = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ value: z.string().min(16).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const { changeNt009Start } = await import('./platform-settings-admin.server');
    return changeNt009Start(context.supabase, context.userId, data.value);
  });
export const updateFiscalPlatformSetting = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ setting: z.enum(['ibscbs_required_sandbox_from', 'ibscbs_required_production_from', 'nt009r2_sandbox_starts_at', 'nt009r2_production_starts_at']), value: z.string().max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const { changeFiscalSetting } = await import('./platform-settings-admin.server');
    return changeFiscalSetting(context.supabase, context.userId, data.setting, data.value);
  });
