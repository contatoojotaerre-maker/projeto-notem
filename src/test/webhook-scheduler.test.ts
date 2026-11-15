import { describe, it, expect, vi } from 'vitest'
import { generateKeyPair, SignJWT } from 'jose'
import { verifyScheduler, schedulerAudience } from '../lib/webhook-scheduler.server'

const signing = await generateKeyPair('RS256')
vi.mock('jose', async (original) => {
  const actual = await original<typeof import('jose')>()
  return { ...actual, createRemoteJWKSet: () => async () => signing.publicKey }
})
const email = 'scheduler@notem-test.iam.gserviceaccount.com'
const account = JSON.stringify({ client_email: email, client_id: '123456' })
async function request(overrides: Record<string, unknown> = {}) {
  const token = await new SignJWT({ email, email_verified: true, ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com')
    .setAudience(schedulerAudience).setSubject('123456').setIssuedAt().setExpirationTime('5m').sign(signing.privateKey)
  return new Request(schedulerAudience, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
}
describe('Google Scheduler OIDC', () => {
  it('accepts the verified configured service account with exact audience', async () => {
    expect(await verifyScheduler(await request(), account)).toBe(true)
  })
  it('rejects another service account', async () => {
    expect(await verifyScheduler(await request({ email: 'other@test.iam.gserviceaccount.com' }), account)).toBe(false)
  })
  it('rejects unverified email', async () => {
    expect(await verifyScheduler(await request({ email_verified: false }), account)).toBe(false)
  })
  it('rejects missing bearer token', async () => {
    expect(await verifyScheduler(new Request(schedulerAudience), account)).toBe(false)
  })
  it('rejects another audience', async () => {
    const token = await new SignJWT({ email, email_verified: true }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com').setAudience('https://other.example/process')
      .setSubject('123456').setIssuedAt().setExpirationTime('5m').sign(signing.privateKey)
    expect(await verifyScheduler(new Request(schedulerAudience, { headers: { Authorization: `Bearer ${token}` } }), account)).toBe(false)
  })
  it('rejects another issuer', async () => {
    const token = await new SignJWT({ email, email_verified: true }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://untrusted.example').setAudience(schedulerAudience)
      .setSubject('123456').setIssuedAt().setExpirationTime('5m').sign(signing.privateKey)
    expect(await verifyScheduler(new Request(schedulerAudience, { headers: { Authorization: `Bearer ${token}` } }), account)).toBe(false)
  })
  it('rejects an expired token', async () => {
    const token = await new SignJWT({ email, email_verified: true }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com').setAudience(schedulerAudience)
      .setSubject('123456').setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-60).sign(signing.privateKey)
    expect(await verifyScheduler(new Request(schedulerAudience, { headers: { Authorization: `Bearer ${token}` } }), account)).toBe(false)
  })
  const sign = (b: SignJWT) => b.setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').sign(signing.privateKey)
  const bearer = (t: string) => new Request(schedulerAudience, { headers: { Authorization: `Bearer ${t}` } })
  it('rejects a token of the same e-mail with another account id (sub)', async () => {
    const t = await sign(new SignJWT({ email, email_verified: true }).setAudience(schedulerAudience).setSubject('999999').setIssuedAt().setExpirationTime('5m'))
    expect(await verifyScheduler(bearer(t), account)).toBe(false)
  })
  it('rejects a token without expiry', async () => {
    const t = await sign(new SignJWT({ email, email_verified: true }).setAudience(schedulerAudience).setSubject('123456').setIssuedAt())
    expect(await verifyScheduler(bearer(t), account)).toBe(false)
  })
  it('rejects several audiences even when the callback is one of them', async () => {
    const t = await sign(new SignJWT({ email, email_verified: true }).setAudience([schedulerAudience, 'https://other.example']).setSubject('123456').setIssuedAt().setExpirationTime('5m'))
    expect(await verifyScheduler(bearer(t), account)).toBe(false)
  })
  it('fails closed when the account id is not configured', async () => {
    expect(await verifyScheduler(await request(), JSON.stringify({ client_email: email }))).toBe(false)
  })
})
