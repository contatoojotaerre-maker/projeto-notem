import { describe, it, expect } from 'vitest';
import { canUseCertificate, certificateSituation, cooldownRemaining, formatGovernmentValue, stripSensitive, toTransmissorEnvironment, translateTransmissorError } from '@/lib/certificates';

const now = new Date('2026-11-03T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe('Certificado e convênio', () => {
  it('owner, admin e admin da plataforma podem enviar e verificar', () => {
    expect(canUseCertificate('owner')).toBe(true); expect(canUseCertificate('admin')).toBe(true); expect(canUseCertificate(undefined, true)).toBe(true);
  });
  it('operator, viewer e developer não podem', () => { for (const r of ['operator', 'viewer', 'developer']) expect(canUseCertificate(r)).toBe(false); });
  it('30 dias é âmbar, 31 é válido', () => {
    expect(certificateSituation(days(-10), days(30), now).kind).toBe('expiring');
    expect(certificateSituation(days(-10), days(31), now).kind).toBe('valid');
    expect(certificateSituation(days(-10), days(30), now).label).toBe('Vence em 30 dias');
  });
  it('vencido e início futuro', () => {
    expect(certificateSituation(days(-100), days(-1), now).label).toBe('Vencido');
    expect(certificateSituation(days(2), days(300), now).kind).toBe('not_yet');
  });
  it('intervalo mínimo de 1 minuto', () => {
    expect(cooldownRemaining(new Date(Date.now() - 30_000).toISOString())).toBeGreaterThan(29_000);
    expect(cooldownRemaining(new Date(Date.now() - 61_000).toISOString())).toBe(0);
    expect(cooldownRemaining(null)).toBe(0);
  });
  it('valores do governo sem tradução: só booleanos viram Sim/Não', () => {
    expect(formatGovernmentValue(true)).toBe('Sim'); expect(formatGovernmentValue(false)).toBe('Não');
    expect(formatGovernmentValue(2)).toBe('código 2'); expect(formatGovernmentValue('X')).toBe('X');
  });
  it('ambiente do painel vira ambiente do transmissor', () => {
    expect(toTransmissorEnvironment('sandbox')).toBe('homologacao'); expect(toTransmissorEnvironment('production')).toBe('producao');
  });
  it('códigos do transmissor viram mensagens em português', () => {
    expect(translateTransmissorError('CNPJ_DIVERGENTE')).toBe('O CNPJ do certificado é diferente do cadastro da empresa.');
  });
  it('nenhum material sensível chega ao navegador', () => {
    const out = stripSensitive({ holder: 'A', envelope: { dados: 'x' }, senha: 's', pfx_base64: 'p', nested: [{ nonce: 'n', ok: 1 }] });
    expect(JSON.stringify(out)).not.toMatch(/envelope|senha|pfx_base64|nonce/);
    expect(out.holder).toBe('A');
  });
});
