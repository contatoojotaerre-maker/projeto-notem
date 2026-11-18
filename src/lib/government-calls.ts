// Classifies a real transmissor reply into one government-call sample (no body, key or tax ID is kept).
import type { Env, GovOutcome, GovService, GovSystem } from './health-policy';

const ROUTES: Record<string, { system: GovSystem; service: GovService }> = {
  '/v1/nfse/emitir': { system: 'sefin', service: 'emissao' },
  '/v1/dps/consultar': { system: 'sefin', service: 'consulta' },
  '/v1/nfse/consultar': { system: 'sefin', service: 'consulta' },
  '/v1/nfse/evento/consultar': { system: 'sefin', service: 'consulta' },
  '/v1/nfse/evento': { system: 'sefin', service: 'evento' },
  '/v1/municipios/convenio': { system: 'adn', service: 'consulta' },
  '/v1/adn/dfe': { system: 'adn', service: 'distribuicao' },
  '/v1/adn/eventos': { system: 'adn', service: 'distribuicao' },
};
export type GovernmentCallSample = { environment: Env; system: GovSystem; service: GovService; outcome: GovOutcome; http_status: number | null; duration_ms: number | null };

/** Any government answer below 500 (including rule refusals and "not found") means the service works. */
export function governmentSample(path: string, payload: unknown, body: unknown): GovernmentCallSample | null {
  const route = ROUTES[path]; if (!route) return null;
  const amb = (payload as { ambiente?: unknown } | null)?.ambiente;
  const environment: Env | null = amb === 'producao' ? 'production' : amb === 'homologacao' ? 'sandbox' : null;
  if (!environment) return null;
  const r = (body as { resposta?: { status?: unknown; erro?: unknown; ms?: unknown } } | null)?.resposta;
  if (!r || typeof r !== 'object') return null;
  const ms = typeof r.ms === 'number' && Number.isFinite(r.ms) ? Math.max(0, Math.min(600_000, Math.round(r.ms))) : null;
  const status = typeof r.status === 'number' && r.status >= 100 && r.status <= 599 ? r.status : null;
  let outcome: GovOutcome;
  if (r.erro === 'TEMPO_ESGOTADO') outcome = 'tempo_esgotado';
  else if (typeof r.erro === 'string') outcome = 'conexao';
  else if (status === null) return null;
  else outcome = status >= 500 ? 'erro_governo' : 'respondeu';
  return { ...route, environment, outcome, http_status: status, duration_ms: ms };
}
