import type { IbsCbsValues } from '@/lib/nfse-layout-read';

const money = (v: string | null | undefined) => (v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: string | null | undefined) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`);

/** IBS/CBS calculated by the government, read from the authorized NFS-e. Renders nothing for notes without the group. */
export function IbsCbsSection({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null;
  const v = value as IbsCbsValues;
  const rows: [string, string][] = [
    ['Classificação (CST / código)', `${v.classificacao?.cst ?? '—'} / ${v.classificacao?.codigo ?? '—'}`],
    ['Indicador de operação', v.indicador_operacao ?? '—'],
    ['Local de incidência', v.localidade_incidencia?.nome ? `${v.localidade_incidencia.nome}${v.localidade_incidencia.codigo_municipio ? ` (${v.localidade_incidencia.codigo_municipio})` : ''}` : '—'],
    ['Base de cálculo', money(v.base_calculo)],
    ['IBS estadual (alíquota efetiva)', `${money(v.ibs_uf?.valor)} (${pct(v.ibs_uf?.aliquota_efetiva)})`],
    ['IBS municipal (alíquota efetiva)', `${money(v.ibs_municipal?.valor)} (${pct(v.ibs_municipal?.aliquota_efetiva)})`],
    ['CBS (alíquota efetiva)', `${money(v.cbs?.valor)} (${pct(v.cbs?.aliquota_efetiva)})`],
    ['Total do IBS/CBS', money(v.valor_total_ibs_cbs)],
    ['Valor líquido + IBS/CBS', money(v.valor_total_nota)],
  ];
  return <section className="border-t border-border pt-5"><h2 className="mb-1 text-lg font-medium">IBS/CBS</h2><p className="mb-4 text-xs text-muted-foreground">Valores calculados pelo governo e informados na nota autorizada.</p>
    <dl className="space-y-3 text-sm">{rows.map(([k, val]) => <div key={k} className="flex justify-between gap-5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{val}</dd></div>)}</dl></section>;
}
