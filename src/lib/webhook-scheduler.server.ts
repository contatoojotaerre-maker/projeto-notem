import { createRemoteJWKSet, jwtVerify } from 'jose'

export const schedulerAudience = 'https://app.notemfiscal.com.br/api/public/webhooks/process'

export async function verifyScheduler(request: Request, accountJson: string | undefined) {
  if (!accountJson) return false
  let email: unknown
  try { email = (JSON.parse(accountJson) as { client_email?: unknown }).client_email } catch { return false }
  if (typeof email !== 'string' || !email.endsWith('.gserviceaccount.com')) return false
  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  try {
    const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 })
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: schedulerAudience, maxTokenAge: '1h', clockTolerance: 30,
    })
    return payload['email'] === email && payload['email_verified'] === true && typeof payload.sub === 'string'
  } catch { return false }
}