import { describe, it, expect } from 'vitest'
import { APP_URL, APP_HOST, API_BASE, appLink } from '@/lib/app-url'
import { schedulerAudience } from '@/lib/webhook-scheduler.server'

describe('domínio oficial', () => {
  it('usa app.notemfiscal.com.br', () => { expect(APP_URL).toBe('https://app.notemfiscal.com.br'); expect(APP_HOST).toBe('app.notemfiscal.com.br') })
  it('API em /api/v1', () => expect(API_BASE).toBe('https://app.notemfiscal.com.br/api/v1'))
  it('links de e-mail', () => { expect(appLink('/definir-senha')).toBe('https://app.notemfiscal.com.br/definir-senha'); expect(appLink('redefinir-senha')).toBe('https://app.notemfiscal.com.br/redefinir-senha') })
  it('audiência do agendador inalterada', () => expect(schedulerAudience).toBe('https://app.notemfiscal.com.br/api/public/webhooks/process'))
})
