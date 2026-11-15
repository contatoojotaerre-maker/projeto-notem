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
