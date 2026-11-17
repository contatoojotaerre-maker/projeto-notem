import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavGroup, useNavGroups, type NavGroupItem } from '@/components/notem/nav-group';
import { NAV_GROUPS_KEY, currentNavGroup, navSubitemActive, parseNavGroupState } from '@/lib/nav-groups';

const ID = '0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a';
beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver; });
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

const link = (key: string, label: string, active: boolean, href: string): NavGroupItem => ({ key, label, active, render: ({ children, ...p }) => <a href={href} {...p}>{children}</a> });
/** The two groups exactly as the shell wires them (same hook, same component, same active rule). */
function Menu({ path, search = '', iconOnly = false, onNavigate = () => {} }: { path: string; search?: string; iconOnly?: boolean; onNavigate?: () => void }) {
  const groups = useNavGroups(currentNavGroup(path), path + search); const sub = navSubitemActive(path, search);
  return <nav>
    <NavGroup id="notas" label="Notas" icon={() => null} open={groups.isOpen('notas')} onToggle={() => groups.toggle('notas')} iconOnly={iconOnly} onNavigate={onNavigate}
      items={[link('emitidas', 'Emitidas', sub.emitidas, '/o/x/notas'), link('recebidas', 'Recebidas', sub.recebidas, '/o/x/notas/recebidas')]} />
    <a href="/o/x/empresas">Empresas</a>
    <NavGroup id="organizacao" label="Organização" icon={() => null} open={groups.isOpen('organizacao')} onToggle={() => groups.toggle('organizacao')} iconOnly={iconOnly} onNavigate={onNavigate}
      items={[link('dados', 'Dados', sub.dados, '/o/x/organizacao'), link('equipe', 'Equipe', sub.equipe, '/o/x/organizacao?aba=equipe')]} />
  </nav>;
}
const parent = (name: string) => screen.getByRole('button', { name });
const sublink = (name: string) => screen.getByText(name).closest('a')!;
const stored = () => JSON.parse(window.localStorage.getItem(NAV_GROUPS_KEY) ?? 'null');

describe('menu: grupos recolhíveis', () => {
  it('item pai é botão (não navega), com seta; abre e fecha', async () => {
    const user = userEvent.setup(); render(<Menu path="/o/x/inicio" />);
    const notas = parent('Notas');
    expect(notas.tagName).toBe('BUTTON'); expect(notas).not.toHaveAttribute('href');
    expect(notas).toHaveAttribute('aria-expanded', 'false');
    expect(notas.closest('.nav-group')).toHaveAttribute('data-open', 'false');
    await user.click(notas);
    expect(notas).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(notas.getAttribute('aria-controls')!)).not.toHaveAttribute('inert');
    await user.click(notas);
    expect(notas).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(notas.getAttribute('aria-controls')!)).toHaveAttribute('inert');
  });

  it('abre sozinho ao entrar por link numa nota recebida, com Recebidas destacado', () => {
    window.localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify({ notas: false, organizacao: false }));
    render(<Menu path={`/o/x/notas/recebidas/${ID}`} />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true');
    expect(parent('Notas')).toHaveAttribute('data-parent-active', 'true');
    expect(sublink('Recebidas')).toHaveAttribute('data-active', 'true');
    expect(sublink('Emitidas')).toHaveAttribute('data-active', 'false');
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'false');
  });

  it('abre sozinho ao entrar por link em Equipe, com Equipe destacado', () => {
    render(<Menu path="/o/x/organizacao" search="?aba=equipe" />);
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'true');
    expect(sublink('Equipe')).toHaveAttribute('data-active', 'true');
    expect(sublink('Dados')).toHaveAttribute('data-active', 'false');
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'false');
  });

  it('ao ir para outra seção os grupos ficam como o usuário deixou; só o da seção atual é aberto', async () => {
    const user = userEvent.setup(); const { rerender } = render(<Menu path="/o/x/notas" />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true');
    rerender(<Menu path="/o/x/empresas" />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true'); // continua aberto
    await user.click(parent('Notas'));
    rerender(<Menu path="/o/x/alertas" />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'false'); // continua fechado
    rerender(<Menu path="/o/x/notas/recebidas" />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true'); // seção atual: abre
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'false');
  });

  it('lembra o estado neste navegador', async () => {
    const user = userEvent.setup(); const first = render(<Menu path="/o/x/inicio" />);
    await user.click(parent('Organização'));
    expect(stored()).toEqual({ notas: false, organizacao: true });
    first.unmount();
    render(<Menu path="/o/x/inicio" />);
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'true');
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'false');
  });

  it('falha no armazenamento não quebra: tudo fechado, exceto o grupo da seção atual', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup(); render(<Menu path="/o/x/notas" />);
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true');
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'false');
    await user.click(parent('Organização'));
    expect(parent('Organização')).toHaveAttribute('aria-expanded', 'true');
    expect(parseNavGroupState('{quebrado')).toEqual({ notas: false, organizacao: false });
    expect(parseNavGroupState('{"notas":"sim"}')).toEqual({ notas: false, organizacao: false });
  });

  it('menu recolhido: ícone abre menu flutuante com os subitens; fecha ao escolher, ao clicar fora e com Esc', async () => {
    const user = userEvent.setup(); const onNavigate = vi.fn();
    render(<Menu path={`/o/x/notas/recebidas/${ID}`} iconOnly onNavigate={onNavigate} />);
    const notas = parent('Notas');
    expect(notas).toHaveAttribute('data-parent-active', 'true'); // ícone destacado
    expect(parent('Organização')).toHaveAttribute('data-parent-active', 'false');
    expect(screen.queryByText('Emitidas')).toBeNull();
    await user.click(notas);
    const flyout = await screen.findByRole('dialog', { name: 'Notas' });
    expect(flyout).toHaveTextContent('Emitidas'); expect(flyout).toHaveTextContent('Recebidas');
    expect(sublink('Recebidas')).toHaveAttribute('data-active', 'true');
    await user.click(sublink('Emitidas'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(notas); await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(parent('Organização'));
    expect(await screen.findByRole('dialog', { name: 'Organização' })).toHaveTextContent('Equipe');
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('teclado: Enter/Espaço abrem e fecham; Tab percorre os subitens só quando o grupo está aberto', async () => {
    const user = userEvent.setup(); render(<Menu path="/o/x/inicio" />);
    await user.tab(); expect(parent('Notas')).toHaveFocus();
    await user.tab(); expect(screen.getByText('Empresas')).toHaveFocus(); // fechado: pula os subitens
    await user.tab({ shift: true }); expect(parent('Notas')).toHaveFocus();
    await user.keyboard('{Enter}'); expect(parent('Notas')).toHaveAttribute('aria-expanded', 'true');
    await user.tab(); expect(sublink('Emitidas')).toHaveFocus();
    await user.tab(); expect(sublink('Recebidas')).toHaveFocus();
    await user.tab(); expect(screen.getByText('Empresas')).toHaveFocus();
    await user.tab(); expect(parent('Organização')).toHaveFocus();
    await user.keyboard(' '); expect(parent('Organização')).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' '); expect(parent('Organização')).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { parent('Notas').focus(); }); await user.keyboard(' ');
    expect(parent('Notas')).toHaveAttribute('aria-expanded', 'false');
  });

  it('grupo da tela atual e subitem destacado (regra pura)', () => {
    expect(currentNavGroup('/o/x/notas')).toBe('notas');
    expect(currentNavGroup(`/o/x/notas/${ID}`)).toBe('notas');
    expect(currentNavGroup('/o/x/organizacao')).toBe('organizacao');
    for (const p of ['/o/x/inicio', '/o/x/empresas', '/o/x/alertas', '/o/x/integracoes', '/conta', '/admin/organizacoes']) expect(currentNavGroup(p)).toBeNull();
    expect(navSubitemActive(`/o/x/notas/${ID}`, '')).toEqual({ emitidas: true, recebidas: false, dados: false, equipe: false });
    expect(navSubitemActive('/o/x/organizacao', '?aba=Equipe')).toMatchObject({ equipe: true, dados: false });
  });
});
