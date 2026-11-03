import { describe, expect, it } from 'vitest'

// Exercises the actual diagnostic HTTP boundary while publication is pending.
describe('API initial reachability boundary', () => {
  it('rejects requests without a key with the contract envelope and request ID', async () => {
    const response = await fetch('http://localhost:8080/api/v1/status')
    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body.erro).toEqual({ codigo: 'AUTENTICACAO_INVALIDA', mensagem: 'Chave de acesso inválida.', detalhes: [], codigo_governo: null, mensagem_governo: null })
    expect(body.id_requisicao).toMatch(/^req_[a-f0-9]{32}$/)
    expect(response.headers.get('x-request-id')).toBe(body.id_requisicao)
  })
})