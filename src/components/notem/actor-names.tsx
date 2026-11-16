import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getActorNames, searchMunicipalities } from '@/lib/notem.functions';

/** Display names for user ids of an organization (never shows internal codes). */
export function useActorNames(organizationId: string, ids: (string | null | undefined)[]) {
  const get = useServerFn(getActorNames); const list = [...new Set(ids.filter((v): v is string => Boolean(v)))].sort();
  const q = useQuery({ queryKey: ['actor-names', organizationId, list], queryFn: () => get({ data: { organization_id: organizationId, ids: list } }), enabled: list.length > 0, staleTime: 300_000 });
  return (id: string | null | undefined) => !id ? '—' : q.data?.find(a => a.id === id)?.name ?? (q.isError ? 'Responsável não disponível' : '…');
}
/** "Passo de Torres/SC" for an IBGE code (falls back to the code while loading or when unknown). */
export function useMunicipalityName(code: string | null | undefined) {
  const lookup = useServerFn(searchMunicipalities); const valid = Boolean(code && /^\d{7}$/.test(code));
  const q = useQuery({ queryKey: ['municipality-name', code], queryFn: () => lookup({ data: { search: code ?? '' } }), enabled: valid, staleTime: 3_600_000 });
  const m = q.data?.rows.find(r => r.ibge_code === code);
  return m ? `${m.name}/${m.state}` : null;
}
export function MunicipalityName({ code }: { code: string | null | undefined }) { const name = useMunicipalityName(code); return <>{name ?? (code ? `Município IBGE ${code}` : '—')}</>; }
export function ActorName({ organizationId, id }: { organizationId: string; id: string | null | undefined }) { const name = useActorNames(organizationId, [id]); return <>{name(id)}</>; }
