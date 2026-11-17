// Minha conta. The current password is checked for real with the login service (a separate, non-persisted
// client signs in with it); only then the new password is saved and every other session of the user is revoked
// on the server with the caller's own token (scope "others"), so the session in use stays signed in.
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { passwordChangeSchema, passwordMessages } from './account';
import { authErrorMessage } from './auth-messages';
import { PANEL_PASSWORD_LIMITS, limitMessages } from './api-policy';

function verifierClient() {
  const url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('AUTH_CONFIG_MISSING');
  // New publishable keys are opaque (not JWTs): send them as apikey only.
  const shim: typeof fetch = (input, init) => { const h = new Headers(init?.headers); if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); };
  return import('@supabase/supabase-js').then(({ createClient }) => createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: shim } }));
}

export const changePassword = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(passwordChangeSchema).handler(async ({ context, data }) => {
  if (data.current === data.next) return { ok: false as const, mensagem: passwordMessages.same };
  const email = String(context.claims.email ?? ''); if (!email) return { ok: false as const, mensagem: passwordMessages.notConfirmed };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const rate = await supabaseAdmin.rpc('api_rate_check', { _org: null as never, _rules: [{ scope: `painel-senha:${context.userId}`, bucket: 'painel_senha', ...PANEL_PASSWORD_LIMITS }] as never });
  if (rate.error) console.error('PANEL_PASSWORD_RATE_FAILED'); // counter outage: fail open, as in the API
  else if ((rate.data as { allowed?: boolean } | null)?.allowed === false) return { ok: false as const, mensagem: limitMessages['painel_senha'] ?? passwordMessages.failed };
  let verifier: Awaited<ReturnType<typeof verifierClient>>;
  try { verifier = await verifierClient(); } catch { return { ok: false as const, mensagem: passwordMessages.failed }; }
  const signIn = await verifier.auth.signInWithPassword({ email, password: data.current });
  if (signIn.error || signIn.data.user?.id !== context.userId) { if (signIn.data.session) await verifier.auth.signOut({ scope: 'local' }); return { ok: false as const, mensagem: passwordMessages.notConfirmed }; }
  const updated = await verifier.auth.updateUser({ password: data.next });
  await verifier.auth.signOut({ scope: 'local' }); // the verification session never stays open
  if (updated.error) { console.error('PANEL_PASSWORD_UPDATE_FAILED', updated.error.code ?? ''); return { ok: false as const, mensagem: authErrorMessage(updated.error, 'password') }; }
  const token = (getRequest()?.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const others = token ? await supabaseAdmin.auth.admin.signOut(token, 'others') : { error: new Error('NO_TOKEN') };
  if (others.error) { console.error('PANEL_PASSWORD_OTHERS_SIGNOUT_FAILED'); return { ok: true as const, othersEnded: false as const }; }
  return { ok: true as const, othersEnded: true as const };
});
