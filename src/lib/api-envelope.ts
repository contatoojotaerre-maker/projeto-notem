// Pure, dependency-free shape of every public API error (shared by apiRoute and host-level answers in src/server.ts).
export type ApiErrorDetail = { campo: string; mensagem: string }
export function apiErrorEnvelope(requestId: string, code: string, message: string, details: ApiErrorDetail[] = []) {
  return { erro: { codigo: code, mensagem: message, detalhes: details, codigo_governo: null, mensagem_governo: null }, id_requisicao: requestId }
}
export const newRequestId = () => `req_${crypto.randomUUID().replaceAll('-', '')}`
