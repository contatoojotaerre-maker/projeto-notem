import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requireOrgMember } from '@/lib/panel-access';

const rpc = (admin: unknown, member: unknown, error: unknown = null) => ({ rpc: async (fn: string) => ({ data: fn === 'is_platform_admin' ? admin : member, error }) });
describe('acesso do painel às notas', () => {
  it('membro da organização passa', async () => { await expect(requireOrgMember(rpc(false, true), 'o')).resolves.toBeUndefined(); });
  it('administrador da plataforma passa', async () => { await expect(requireOrgMember(rpc(true, false), 'o')).resolves.toBeUndefined(); });
  it('usuário de outra organização é recusado', async () => { await expect(requireOrgMember(rpc(false, false), 'o')).rejects.toThrow(); });
  it('erro na verificação recusa', async () => { await expect(requireOrgMember(rpc(true, true, { code: 'x' }), 'o')).rejects.toThrow(); });
  it('detalhe e PDF da nota conferem a organização antes de usar o acesso de serviço', () => {
    const src = readFileSync('src/lib/invoices.functions.ts', 'utf8');
    for (const name of ['getPanelInvoice', 'getPanelInvoicePdf']) {
      const body = src.slice(src.indexOf(`export const ${name}=`)); const end = body.indexOf('\nexport const ', 10); const fn = end > 0 ? body.slice(0, end) : body;
      const guard = fn.indexOf('await requireMember('); const admin = fn.indexOf('client.server');
      expect(guard).toBeGreaterThan(0); if (admin >= 0) expect(guard).toBeLessThan(admin);
    }
  });
});
