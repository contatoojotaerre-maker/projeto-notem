import { createRemoteJWKSet, jwtVerify } from 'jose'

import { appLink } from '@/lib/app-url'

export const schedulerAudience = appLink('/api/public/webhooks/process')

export const healthAudience = appLink('/api/public/saude/verificar')

/** Google OIDC from the configured service account, for exactly one callback URL (audience). */
export async function verifyScheduler(request: Request, accountJson: string | undefined, audience: string = schedulerAudience) {
  if (!accountJson) return false
  let email: unknown; let clientId: unknown
  try { const a = JSON.parse(accountJson) as { client_email?: unknown; client_id?: unknown }; email = a.client_email; clientId = a.client_id } catch { return false }
  if (typeof email !== 'string' || !email.endsWith('.gserviceaccount.com')) return false
  if (typeof clientId !== 'string' || !/^\d+$/.test(clientId)) return false
  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  try {
    const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 })
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience, maxTokenAge: '1h', clockTolerance: 30,
      requiredClaims: ['exp', 'iat', 'sub', 'email', 'email_verified'],
    })
    // Exactly this service account (stable numeric id) and exactly this callback as the single audience.
    return payload.aud === audience && payload['email'] === email && payload['email_verified'] === true && payload.sub === clientId
  } catch { return false }
}