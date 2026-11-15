import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The panel note list runs list_org_notes with the signed-in user's own permissions.
// org_proven_cnpj is restricted to the server (no EXECUTE for signed-in users), so calling it
// there makes every note list fail with "Não foi possível carregar as notas.".
describe('lista de notas do painel', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const latest = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(join(dir, f), 'utf8'))
    .filter(sql => /CREATE OR REPLACE FUNCTION public\.list_org_notes\(/.test(sql)).pop() ?? '';
  const body = latest.slice(latest.indexOf('FUNCTION public.list_org_notes('));
  const fn = body.slice(0, body.indexOf('$function$;') > 0 ? body.indexOf('$function$;') : body.indexOf('$$;'));

  it('existe uma definição da função', () => { expect(fn.length).toBeGreaterThan(100); });
  it('não chama a regra de posse restrita ao servidor', () => { expect(fn).not.toMatch(/org_proven_cnpj\s*\(/); });
  it('continua exigindo certificado com o mesmo CNPJ da empresa da organização', () => {
    expect(fn).toMatch(/company_certificates/);
    expect(fn).toMatch(/c2\.organization_id=_org/);
  });
});
