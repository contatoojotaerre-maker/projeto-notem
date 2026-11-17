import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it.each(['/entrar','/esqueci-senha','/definir-senha','/redefinir-senha'])('has one public route for %s', path => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(path);
  });
  it.each(['/auth','/reset-password'])('removes duplicated public route %s', path => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(rootRouteId);
  });
  it('a lista de Notas tem rota própria (filtros no endereço), separada do detalhe', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes('/o/org/notas').at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/');
    expect(router.matchRoutes('/o/org/notas/0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a').at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/$invoiceId');
  });
  it('Notas recebidas têm rotas próprias: /notas/recebidas/{id} nunca é tratada como /notas/{id}', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const id = '0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a';
    expect(router.matchRoutes('/o/org/notas/recebidas').at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/recebidas/');
    expect(router.matchRoutes(`/o/org/notas/recebidas/${id}`).at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/recebidas/$noteId');
    expect(router.matchRoutes('/o/org/notas/recebidas/abc').at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/recebidas/$noteId');
    expect(router.matchRoutes(`/o/org/notas/${id}`).at(-1)?.routeId).toBe('/_authenticated/o/$orgSlug/notas/$invoiceId');
  });
  it('Minha conta tem rota própria', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes('/conta').at(-1)?.routeId).toBe('/_authenticated/conta');
  });
});
