// Where the panel returns after sign-in. Only internal paths are ever accepted (validated when the
// destination is saved AND when it is read back), so a crafted link can never become an open redirect.
export const DEFAULT_DESTINATION = '/dashboard';
const STORAGE_KEY = 'notem-destino';
const AUTH_PAGES = ['/entrar', '/esqueci-senha', '/definir-senha', '/redefinir-senha'];

/** The path itself when it is a safe internal path ("/…", no "//", no "\", no scheme, no control characters); otherwise null. */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f\s]/.test(value)) return null;
  let decoded = value;
  try { for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(decoded); i++) decoded = decodeURIComponent(decoded); } catch { return null; }
  if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded) || /^\/*[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  try { const url = new URL(value, 'https://notem.invalid'); if (url.origin !== 'https://notem.invalid') return null; } catch { return null; }
  const pathname = value.split(/[?#]/)[0] ?? '';
  if (AUTH_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return value;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function store(): Store | null { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } }

/** Keeps the destination for this browser tab (survives the Google return and the invitation page). */
export function rememberDestination(value: unknown, s: Store | null = store()) {
  const path = safeInternalPath(value); if (!path || !s) return;
  try { s.setItem(STORAGE_KEY, path); } catch { /* storage unavailable: the default destination is used */ }
}
/** Reads, validates again and deletes the saved destination; falls back to the default. */
export function takeDestination(s: Store | null = store(), fallback = DEFAULT_DESTINATION): string {
  if (!s) return fallback;
  let saved: string | null = null;
  try { saved = s.getItem(STORAGE_KEY); s.removeItem(STORAGE_KEY); } catch { return fallback; }
  return safeInternalPath(saved) ?? fallback;
}
