import { isNotFound, isRedirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }));
// Loader checks only: the workspace comes from a stub, so no server is needed.
const org = { id: '11111111-1111-4111-8111-111111111111', slug: 'org', name: 'Org' };
const context = { queryClient: { ensureQueryData: vi.fn(async () => ({ organizations: [org], profile: { environment: 'production' } })) } };

async function loaderError(route: { options: { loader?: unknown } }, params: Record<string, string>) {
  try { await (route.options.loader as (a: unknown) => Promise<unknown>)({ context, params }); return null; } catch (e) { return e; }
}

describe('id inválido dá "Página não encontrada" nas duas páginas de nota', () => {
  it.each(['abc', 'recebidas', '0b5d1c1e-8f7a-4a7e-9a1d', "1' or 1=1"])('notas emitidas: %s', async id => {
    const { Route } = await import('@/routes/_authenticated/o/$orgSlug/notas/$invoiceId');
    expect(isNotFound(await loaderError(Route, { orgSlug: 'org', invoiceId: id }))).toBe(true);
  });
  it.each(['abc', '0b5d1c1e-8f7a-4a7e-9a1d', "1' or 1=1"])('notas recebidas: %s', async id => {
    const { Route } = await import('@/routes/_authenticated/o/$orgSlug/notas/recebidas/$noteId');
    expect(isNotFound(await loaderError(Route, { orgSlug: 'org', noteId: id }))).toBe(true);
  });
  it('organização de outra pessoa também dá não encontrada', async () => {
    const { Route } = await import('@/routes/_authenticated/o/$orgSlug/notas/recebidas/$noteId');
    expect(isNotFound(await loaderError(Route, { orgSlug: 'outra', noteId: '0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a' }))).toBe(true);
  });
});

describe('aba antiga "Notas recebidas" da empresa', () => {
  it('redireciona para Notas › Recebidas filtrada pela empresa', async () => {
    const { Route } = await import('@/routes/_authenticated/o/$orgSlug/empresas/$companyId');
    const companyId = '0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a';
    let err: unknown = null;
    try { (Route.options.beforeLoad as (a: unknown) => void)({ params: { orgSlug: 'org', companyId }, search: { aba: 'Notas recebidas' } }); } catch (e) { err = e; }
    expect(isRedirect(err)).toBe(true);
    const opts = (err as { options: { to: string; search: unknown } }).options;
    expect(opts.to).toBe('/o/$orgSlug/notas/recebidas');
    expect(opts.search).toEqual({ empresa: companyId });
  });
});
