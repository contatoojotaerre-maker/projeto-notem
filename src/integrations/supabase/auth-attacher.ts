import { createMiddleware } from '@tanstack/react-start';
import { supabase } from './client';

export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});