#!/usr/bin/env python3
"""Gera a carga idempotente dos catálogos IBS/CBS a partir dos arquivos oficiais em docs/referencias/rtc/.

Uso: python3 scripts/gerar-carga-ibscbs.py > /tmp/carga-ibscbs.sql
     python3 scripts/gerar-carga-ibscbs.py --resumo   (contagens em JSON, usado nos testes)
Somente leitura dos arquivos; os valores oficiais são preservados como estão (apenas espaços nas pontas são removidos).
"""
import csv, hashlib, io, json, os, re, sys
import openpyxl

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'referencias', 'rtc')
CSV_FILE = 'classificacao_tributaria.csv'
INDOP_FILE = 'anexovii-indop_ibscbs_v1-03-00-nt009.xlsx'
CORR_FILE = 'anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx'
VERSIONS = {'ibscbs_classifications': 'classificacao_tributaria.csv (NFSE = Sim)', 'ibscbs_operation_indicators': 'Anexo VII v1.03.00', 'ibscbs_service_correlations': 'Anexo VIII v1.02.00'}
REMOVED_INDOP = ['030103', '030104', '050103', '050104', '080101']

def sha(name):
    with open(os.path.join(ROOT, name), 'rb') as f: return hashlib.sha256(f.read()).hexdigest()
def s(v):
    if v is None: return None
    t = str(v).strip()
    return t or None
def yes(v): return s(v) == 'Sim'
def q(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def classifications():
    text = open(os.path.join(ROOT, CSV_FILE), 'rb').read().decode('utf-8-sig')
    rows = [r for r in csv.DictReader(io.StringIO(text), delimiter=';') if r['NFSE'] == 'Sim']
    out = []
    for r in rows:
        code = s(r['Código da Classificação Tributária']); cst = s(r['Código da Situação Tributária'])
        assert re.fullmatch(r'[0-9]{6}', code) and cst == code[:3], code
        out.append({'code': code, 'cst': cst, 'cst_description': s(r['Descrição da Situação Tributária']), 'description': s(r['Descrição do Código da Classificação Tributária']),
                    'requires_taxation': yes(r['Exige Tributação']), 'ibs_reduction_percent': float(s(r['Percentual Redução IBS']).replace(',', '.')), 'cbs_reduction_percent': float(s(r['Percentual Redução CBS']).replace(',', '.')),
                    'regular_taxation': yes(r['Tributação Regular']), 'presumed_credit': yes(r['Crédito Presumido']), 'deferral': yes(r['Diferimento']),
                    'simples_revenue_type': s(r['Tipo de Receita Bruta do Simples Nacional']), 'donation_type': s(r['Tipo de Doação']), 'legislation_url': s(r['Url da Legislação'])})
    return out

def indicators():
    wb = openpyxl.load_workbook(os.path.join(ROOT, INDOP_FILE), read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))[1:]
    out = []
    for r in rows:
        if not s(r[0]) or s(r[7]) != 'S': continue
        out.append({'code': s(r[0]), 'operation_type': s(r[1]), 'supply_characteristic': s(r[2]), 'location_to_identify': s(r[3]), 'legal_basis': s(r[4]), 'notes': s(r[5]), 'incidence_location': s(r[9])})
    return out

def nbs_digits(v):
    t = s(v)
    return re.sub(r'\D', '', t) if t and re.fullmatch(r'[0-9]\.[0-9]{4}\.[0-9]{2}\.[0-9]{2}', t) else None

def correlations():
    wb = openpyxl.load_workbook(os.path.join(ROOT, CORR_FILE), read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))[1:]
    items, cur = [], None
    for r in rows:
        if s(r[0]):
            atv = s(r[4]); atv = atv.zfill(2) if atv and atv.isdigit() else atv
            cur = {'service_item': s(r[0]), 'item_description': s(r[1]), 'nbs': [], 'simples_activity': atv, 'simples_activity_description': s(r[5]), 'operation_indicators': [], 'classifications': []}
            items.append(cur)
        if cur is None: continue
        if s(r[2]) and nbs_digits(r[2]) and all(n['code'] != nbs_digits(r[2]) for n in cur['nbs']): cur['nbs'].append({'code': nbs_digits(r[2]), 'formatted_code': s(r[2]), 'description': s(r[3])})
        if s(r[6]):
            code = s(r[6]).zfill(6)
            if all(i['code'] != code for i in cur['operation_indicators']): cur['operation_indicators'].append({'code': code, 'incidence_location': s(r[7])})
        if s(r[8]) and all(c['code'] != s(r[8]).zfill(6) for c in cur['classifications']): cur['classifications'].append({'code': s(r[8]).zfill(6), 'description': s(r[9])})
    return items

def sql():
    c, i, k = classifications(), indicators(), correlations()
    lines = ['-- Carga gerada por scripts/gerar-carga-ibscbs.py a partir de docs/referencias/rtc/ (não editar à mão).', 'BEGIN;']
    v = VERSIONS
    cols = ['code', 'cst', 'cst_description', 'description', 'requires_taxation', 'ibs_reduction_percent', 'cbs_reduction_percent', 'regular_taxation', 'presumed_credit', 'deferral', 'simples_revenue_type', 'donation_type', 'legislation_url']
    lines.append('INSERT INTO public.ibscbs_classifications(' + ','.join(cols) + ',catalog_version) VALUES')
    lines.append(',\n'.join('(' + ','.join(q(r[x]) for x in cols) + ',' + q(v['ibscbs_classifications']) + ')' for r in c))
    lines.append('ON CONFLICT (code) DO UPDATE SET ' + ','.join(f'{x}=EXCLUDED.{x}' for x in cols[1:]) + ',catalog_version=EXCLUDED.catalog_version;')
    lines.append(f"DELETE FROM public.ibscbs_classifications WHERE code NOT IN ({','.join(q(r['code']) for r in c)}) AND NOT EXISTS (SELECT 1 FROM public.company_service_profiles p WHERE p.ibscbs_classification=ibscbs_classifications.code);")
    icol = ['code', 'operation_type', 'supply_characteristic', 'location_to_identify', 'legal_basis', 'notes', 'incidence_location']
    lines.append('INSERT INTO public.ibscbs_operation_indicators(' + ','.join(icol) + ',operation_location,active,catalog_version) VALUES')
    lines.append(',\n'.join('(' + ','.join(q(r[x]) for x in icol) + ',' + q(r['location_to_identify']) + ',true,' + q(v['ibscbs_operation_indicators']) + ')' for r in i))
    lines.append('ON CONFLICT (code) DO UPDATE SET operation_type=EXCLUDED.operation_type,supply_characteristic=EXCLUDED.supply_characteristic,location_to_identify=EXCLUDED.location_to_identify,legal_basis=EXCLUDED.legal_basis,notes=EXCLUDED.notes,incidence_location=EXCLUDED.incidence_location,active=true,catalog_version=EXCLUDED.catalog_version;')
    lines.append(f"UPDATE public.ibscbs_operation_indicators SET active=false,catalog_version={q(v['ibscbs_operation_indicators'])} WHERE code NOT IN ({','.join(q(r['code']) for r in i)});")
    kcol = ['service_item', 'item_description', 'simples_activity', 'simples_activity_description']
    lines.append('INSERT INTO public.ibscbs_service_correlations(' + ','.join(kcol) + ',nbs,operation_indicators,classifications,catalog_version) VALUES')
    lines.append(',\n'.join('(' + ','.join(q(r[x]) for x in kcol) + ',' + ','.join(q(json.dumps(r[x], ensure_ascii=False)) + '::jsonb' for x in ['nbs', 'operation_indicators', 'classifications']) + ',' + q(v['ibscbs_service_correlations']) + ')' for r in k))
    lines.append('ON CONFLICT (service_item) DO UPDATE SET item_description=EXCLUDED.item_description,simples_activity=EXCLUDED.simples_activity,simples_activity_description=EXCLUDED.simples_activity_description,nbs=EXCLUDED.nbs,operation_indicators=EXCLUDED.operation_indicators,classifications=EXCLUDED.classifications,catalog_version=EXCLUDED.catalog_version;')
    for cat, fname, n in [('ibscbs_classifications', CSV_FILE, len(c)), ('ibscbs_operation_indicators', INDOP_FILE, len(i)), ('ibscbs_service_correlations', CORR_FILE, len(k))]:
        lines.append(f"INSERT INTO public.fiscal_catalog_versions(catalog,version,source_file,source_sha256,row_count,loaded_at) VALUES ({q(cat)},{q(v[cat])},{q('docs/referencias/rtc/' + fname)},{q(sha(fname))},{n},now()) ON CONFLICT (catalog) DO UPDATE SET version=EXCLUDED.version,source_file=EXCLUDED.source_file,source_sha256=EXCLUDED.source_sha256,row_count=EXCLUDED.row_count,loaded_at=EXCLUDED.loaded_at;")
    lines.append('COMMIT;')
    return '\n'.join(lines) + '\n'

if __name__ == '__main__':
    if '--resumo' in sys.argv:
        c, i, k = classifications(), indicators(), correlations()
        print(json.dumps({'classificacoes': len(c), 'exigem_tributacao': sum(r['requires_taxation'] for r in c), 'indicadores': len(i), 'indicadores_codigos': [r['code'] for r in i], 'inativos': REMOVED_INDOP, 'correlacoes': len(k), 'exemplo_0105': next(r for r in k if r['service_item'] == '01.05')}, ensure_ascii=False))
    else:
        sys.stdout.write(sql())
