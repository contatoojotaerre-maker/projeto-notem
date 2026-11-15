import { describe, expect, it } from 'vitest';
import { sanitizeLog } from '@/lib/integrations';
import { logBody, logResponse, readLimitedBody } from '@/lib/api.server';
import { ApiFailure } from '@/lib/api-contract';

describe('registros de requisições guardam o mínimo', () => {
  it('documentos ficam mascarados e contato/endereço são omitidos', () => {
    const out = sanitizeLog({ tomador: { documento: '12345678909', nome: 'Maria', email: 'm@x.com', telefone: '48999999999', endereco: { cep: '88980000' } } }) as Record<string, Record<string, unknown>>;
    expect(out['tomador']!['documento']).toBe('*********09');
    expect(out['tomador']!['nome']).toBe('Maria');
    expect(out['tomador']!['email']).toBe('[OMITIDO]'); expect(out['tomador']!['telefone']).toBe('[OMITIDO]'); expect(out['tomador']!['endereco']).toBe('[OMITIDO]');
  });
  it('XML nunca é guardado no registro', () => {
    expect(sanitizeLog({ xml: '<?xml version="1.0"?><NFSe/>' })).toEqual({ xml: '[XML OMITIDO: 28 bytes]' });
  });
  it('certificado: arquivo e senha removidos', () => {
    expect(logBody('/api/v1/empresas/e1/certificado', { arquivo_base64: 'AAAA', senha: 'segredo' })).toEqual({ arquivo_base64: '[REMOVIDO]', senha: '[REMOVIDO]' });
  });
  it('downloads registram só tipo e tamanho', () => {
    expect(logResponse(new Uint8Array(10), 'application/pdf')).toEqual({ arquivo: 'pdf', bytes: 10 });
    expect(logResponse('<NFSe/>', 'application/xml; charset=utf-8')).toEqual({ arquivo: 'xml', bytes: 7 });
  });
});

describe('tamanho máximo do corpo', () => {
  const big = 'x'.repeat(200 * 1024 + 1);
  it('recusa com 413 corpo maior que 200 KB, mesmo sem Content-Length', async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const req = new Request('https://app.notemfiscal.com.br/api/v1/notas', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readLimitedBody(req)).rejects.toSatisfy((e: unknown) => e instanceof ApiFailure && e.status === 413);
  });
  it('recusa pelo Content-Length declarado antes de ler', async () => {
    const req = new Request('https://app.notemfiscal.com.br/api/v1/notas', { method: 'POST', body: '{}', headers: { 'Content-Length': String(300 * 1024) } });
    await expect(readLimitedBody(req)).rejects.toSatisfy((e: unknown) => e instanceof ApiFailure && e.status === 413);
  });
  it('aceita corpo de até 200 KB', async () => {
    const ok = 'x'.repeat(200 * 1024);
    expect((await readLimitedBody(new Request('https://a.b/', { method: 'POST', body: ok }))).length).toBe(ok.length);
  });
});
