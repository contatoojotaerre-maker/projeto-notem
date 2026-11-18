// Health alerts via Resend (server-only key RESEND_API_KEY). Never throws; returns a short reason on failure.
export const HEALTH_SENDER = 'notem <avisos@notemfiscal.com.br>';
export type SendResult = { ok: true } | { ok: false; error: string };
export type HealthMailer = (to: string[], mail: { subject: string; html: string; text: string }, idempotencyKey: string) => Promise<SendResult>;

export const sendHealthEmail: HealthMailer = async (to, mail, idempotencyKey) => {
  const key = process.env['RESEND_API_KEY'];
  if (!key) return { ok: false, error: 'CHAVE_RESEND_AUSENTE' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.slice(0, 256) },
      body: JSON.stringify({ from: HEALTH_SENDER, to, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) { console.error('HEALTH_EMAIL_FAILED', res.status); return { ok: false, error: `RESEND_HTTP_${res.status}` }; }
    return { ok: true };
  } catch { console.error('HEALTH_EMAIL_FAILED', 'network'); return { ok: false, error: 'RESEND_INDISPONIVEL' }; }
};
