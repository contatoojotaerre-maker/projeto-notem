// Server-only client for the private Cloud Run transmissor. Never log bodies.
let cachedToken: { token: string; exp: number } | null = null;

export class TransmissorError extends Error {
  constructor(public code: string, public status?: number) { super(code); }
}

const b64url = (bytes: Uint8Array | string) => {
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(unescape(encodeURIComponent(bin))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const b64urlBytes = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); };

function config() {
  const url = process.env['TRANSMISSOR_URL']; const raw = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  if (!url || !raw) throw new TransmissorError('CREDENCIAL');
  let sa: { client_email: string; private_key: string };
  try { sa = JSON.parse(raw); } catch { throw new TransmissorError('CREDENCIAL'); }
  return { url: url.replace(/\/+$/, ''), sa };
}

async function identityToken(audience: string, sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 300 > now) return cachedToken.token;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: 'https://oauth2.googleapis.com/token', target_audience: audience, iat: now, exp: now + 3600 }));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64urlBytes(sig)}` }) });
  if (!res.ok) { console.error('transmissor: google token status', res.status); throw new TransmissorError('CREDENCIAL', res.status); }
  const body = await res.json() as { id_token?: string };
  if (!body.id_token) throw new TransmissorError('CREDENCIAL');
  const payload = JSON.parse(atob(body.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  cachedToken = { token: body.id_token, exp: Number(payload.exp) || now + 3000 };
  return body.id_token;
}

export async function callTransmissor<T>(path: '/v1/certificados/preparar' | '/v1/municipios/convenio', payload: unknown): Promise<T> {
  const { url, sa } = config();
  const token = await identityToken(url, sa);
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(40_000) });
  } catch { console.error('transmissor: unreachable', path); throw new TransmissorError('INDISPONIVEL'); }
  if (res.status === 401 || res.status === 403) { cachedToken = null; console.error('transmissor: auth status', res.status); throw new TransmissorError('CREDENCIAL', res.status); }
  if (res.status === 400 || res.status === 422) {
    const body = await res.json().catch(() => ({})) as { erro?: string; codigo?: string; detail?: { erro?: string } | string };
    const code = body.erro ?? body.codigo ?? (typeof body.detail === 'object' ? body.detail?.erro : body.detail) ?? 'REQUISICAO_INVALIDA';
    console.error('transmissor: business error', path, res.status, code);
    throw new TransmissorError(String(code), res.status);
  }
  if (!res.ok) { console.error('transmissor: status', path, res.status); throw new TransmissorError('INDISPONIVEL', res.status); }
  return res.json() as Promise<T>;
}

export function bytesToBase64(bytes: Uint8Array) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
