// Pure, client-safe policy for /api/v1: usage limits (fixed windows counted in the database) and
// classification of registration changes made with sandbox keys. Values here are the defaults;
// public.api_rate_limit_overrides can replace max/window of any bucket for one organization.
import type { Env } from './api-contract';

export type RateRule = { scope: string; bucket: string; max: number; window: number };
export type SlotRule = { scope: string; max: number; ttl: number };
export type LimitInput = { method: string; path: string; env: Env; organization_id: string; key_id: string; params: Record<string, string>; body?: unknown };

/** Default limits (requests per window, window in seconds). */
export const LIMITS = {
  geral: { max: 120, window: 60 },
  geral_rajada: { max: 30, window: 10 },
  geral_organizacao: { max: 240, window: 60 },
  listagem: { max: 60, window: 60 },
  emissao_producao: { max: 20, window: 60 },
  emissao_homologacao: { max: 10, window: 60 },
  evento: { max: 10, window: 60 },
  certificado: { max: 3, window: 600 },
  certificado_empresa_dia: { max: 10, window: 86400 },
  municipio: { max: 1, window: 60 },
  pdf: { max: 20, window: 60 },
  xml: { max: 60, window: 60 },
  sincronizacao: { max: 30, window: 60 },
  sem_chave: { max: 30, window: 60 },
} as const;
/** Simultaneous operations. */
export const SLOTS = { emissao: 2, evento: 1, pdf: 2 } as const;
export const SLOT_TTL_SECONDS = 120;

export const limitMessages: Record<string, string> = {
  municipio: 'Aguarde 1 minuto entre verificações do município para esta empresa e ambiente.',
  simultaneas: 'Há operações simultâneas demais para este recurso. Aguarde a anterior terminar.',
};

const clean = (p: string) => p.replace(/\/+$/, '') || '/';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const LIST = [/^\/api\/v1\/empresas$/, /^\/api\/v1\/notas$/, /^\/api\/v1\/catalogos\/[^/]+$/, /^\/api\/v1\/empresas\/[^/]+\/(servicos|tomadores|notas-recebidas)$/];

export type RouteKind = 'emissao' | 'evento' | 'certificado' | 'municipio' | 'pdf' | 'xml' | 'sincronizacao' | 'listagem' | null;
export function routeKind(method: string, rawPath: string): RouteKind {
  const path = clean(rawPath); const m = method.toUpperCase();
  if (m === 'POST' && (/^\/api\/v1\/notas$/.test(path) || /^\/api\/v1\/notas\/[^/]+\/substituir$/.test(path))) return 'emissao';
  if (m === 'POST' && /^\/api\/v1\/notas\/[^/]+\/(cancelar|solicitar-analise-cancelamento)$/.test(path)) return 'evento';
  if (m === 'POST' && /^\/api\/v1\/empresas\/[^/]+\/certificado$/.test(path)) return 'certificado';
  if (m === 'POST' && /^\/api\/v1\/empresas\/[^/]+\/situacao\/verificar-municipio$/.test(path)) return 'municipio';
  if (m === 'GET' && /\/pdf$/.test(path)) return 'pdf';
  if (m === 'GET' && /\/xml$/.test(path)) return 'xml';
  if (m === 'GET' && /^\/api\/v1\/empresas\/[^/]+\/sincronizacao$/.test(path)) return 'sincronizacao';
  if (m === 'GET' && LIST.some(r => r.test(path))) return 'listagem';
  return null;
}

/** Rules counted for one authenticated request (per key + environment, with an organization ceiling) and its concurrency slot. */
export function limitRules(i: LimitInput): { rules: RateRule[]; slot: SlotRule | null } {
  const key = `chave:${i.key_id}:${i.env}`; const org = `org:${i.organization_id}:${i.env}`;
  const rule = (scope: string, bucket: keyof typeof LIMITS): RateRule => ({ scope, bucket, ...LIMITS[bucket] });
  const rules = [rule(key, 'geral'), rule(key, 'geral_rajada'), rule(org, 'geral_organizacao')];
  const kind = routeKind(i.method, i.path); const company = uuid(i.params['id']) ? i.params['id'] : null;
  let slot: SlotRule | null = null;
  if (kind === 'listagem') rules.push(rule(key, 'listagem'));
  if (kind === 'emissao') {
    rules.push(rule(key, i.env === 'production' ? 'emissao_producao' : 'emissao_homologacao'));
    const b = (i.body && typeof i.body === 'object' ? i.body : {}) as Record<string, unknown>;
    const target = typeof b['empresa_id'] === 'string' ? b['empresa_id'] : typeof b['empresa_id_externo'] === 'string' ? `externo:${b['empresa_id_externo']}` : `nota:${i.params['invoiceId'] ?? ''}`;
    slot = { scope: `emissao:${i.organization_id}:${i.env}:${target}`, max: SLOTS.emissao, ttl: SLOT_TTL_SECONDS };
  }
  if (kind === 'evento') { rules.push(rule(key, 'evento')); slot = { scope: `evento:${i.organization_id}:${i.env}:${i.params['invoiceId'] ?? ''}`, max: SLOTS.evento, ttl: SLOT_TTL_SECONDS }; }
  if (kind === 'certificado') { rules.push(rule(key, 'certificado')); if (company) rules.push(rule(`empresa:${company}`, 'certificado_empresa_dia')); }
  if (kind === 'municipio' && company) rules.push(rule(`empresa:${company}:${i.env}`, 'municipio'));
  if (kind === 'pdf') { rules.push(rule(key, 'pdf')); slot = { scope: `pdf:${key}`, max: SLOTS.pdf, ttl: 60 }; }
  if (kind === 'xml') rules.push(rule(key, 'xml'));
  if (kind === 'sincronizacao') rules.push(rule(key, 'sincronizacao'));
  return { rules, slot };
}
/** Requests without a valid key: counted per (hashed) client address. */
export const anonymousRules = (ipHash: string): RateRule[] => [{ scope: `ip:${ipHash}`, bucket: 'sem_chave', ...LIMITS.sem_chave }];

// ---------- Registration changes made with sandbox keys ----------
export type SandboxItem = 'empresa' | 'configuracao_fiscal' | 'servico' | 'tomador' | 'certificado';
export type SandboxAction = 'criado' | 'alterado' | 'excluido';
export function sandboxChange(method: string, rawPath: string): { item: SandboxItem; action: SandboxAction } | null {
  const path = clean(rawPath); const m = method.toUpperCase();
  if (m === 'POST' && path === '/api/v1/empresas') return { item: 'empresa', action: 'criado' };
  if (/^\/api\/v1\/empresas\/[^/]+$/.test(path)) return m === 'PATCH' ? { item: 'empresa', action: 'alterado' } : m === 'DELETE' ? { item: 'empresa', action: 'excluido' } : null;
  if (m === 'PUT' && /^\/api\/v1\/empresas\/[^/]+\/configuracao-fiscal$/.test(path)) return { item: 'configuracao_fiscal', action: 'alterado' };
  if (m === 'POST' && /^\/api\/v1\/empresas\/[^/]+\/servicos$/.test(path)) return { item: 'servico', action: 'criado' };
  if (m === 'PATCH' && /^\/api\/v1\/empresas\/[^/]+\/servicos\/[^/]+$/.test(path)) return { item: 'servico', action: 'alterado' };
  if (m === 'POST' && /^\/api\/v1\/empresas\/[^/]+\/tomadores$/.test(path)) return { item: 'tomador', action: 'criado' };
  if (m === 'PATCH' && /^\/api\/v1\/empresas\/[^/]+\/tomadores\/[^/]+$/.test(path)) return { item: 'tomador', action: 'alterado' };
  if (m === 'POST' && /^\/api\/v1\/empresas\/[^/]+\/certificado$/.test(path)) return { item: 'certificado', action: 'alterado' };
  return null;
}
const itemLabels: Record<SandboxItem, [string, 'f' | 'm']> = { empresa: ['Empresa', 'f'], configuracao_fiscal: ['Configuração fiscal', 'f'], servico: ['Serviço', 'm'], tomador: ['Tomador', 'm'], certificado: ['Certificado', 'm'] };
const verbs: Record<SandboxAction, string> = { criado: 'criad', alterado: 'alterad', excluido: 'excluíd' };
/** "Serviço alterado pela chave de homologação da integração X". */
export function sandboxChangeMessage(item: SandboxItem, action: SandboxAction, integration: string) {
  const [label, g] = itemLabels[item]; return `${label} ${verbs[action]}${g === 'f' ? 'a' : 'o'} pela chave de homologação da integração ${integration}`;
}
