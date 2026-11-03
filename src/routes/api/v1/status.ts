import { createFileRoute } from '@tanstack/react-router'

// Initial reachability check: no keys or data exist until Phase 3A migration.
export const Route = createFileRoute('/api/v1/status')({
  server: { handlers: { GET: async () => {
    const id = `req_${crypto.randomUUID().replaceAll('-', '')}`
    return Response.json({ erro: { codigo: 'AUTENTICACAO_INVALIDA', mensagem: 'Chave de acesso inválida.', detalhes: [], codigo_governo: null, mensagem_governo: null }, id_requisicao: id }, { status: 401, headers: { 'X-Request-Id': id, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
  } } },
})