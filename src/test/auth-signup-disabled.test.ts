import { describe, expect, it } from 'vitest';

// Accounts are created only by invitation: the public sign-up of the authentication service must stay off.
const url = process.env['VITE_SUPABASE_URL'] ?? 'https://crtmzascjihzwckxmmyp.supabase.co';
const key = process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? 'sb_publishable_0MnPUdPRggg6XeZufsvNjA_ifVcM5hn';
describe('cadastro público', () => {
  it('está desligado na configuração pública', async () => {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    expect(r.status).toBe(200);
    const s = await r.json() as { disable_signup?: boolean; mailer_autoconfirm?: boolean };
    expect(s.disable_signup).toBe(true);
    expect(s.mailer_autoconfirm).toBe(false);
  }, 20_000);
});
