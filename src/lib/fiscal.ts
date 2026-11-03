import { z } from 'zod';
export const CNPJ_LOCK_MESSAGE = 'O CNPJ não pode ser alterado porque a empresa já tem certificado ou série. Cadastre uma nova empresa.';
export const fiscalIds = z.object({ company_id: z.string().uuid(), organization_id: z.string().uuid() });
const percent = z.number().min(0).max(100).nullable();
export const seriesSchema = z.number().int().min(1).max(49999);
export const fiscalSchema = fiscalIds.extend({
  simples_nacional_option: z.number().int().min(1).max(3), simples_nacional_regime: z.number().int().min(1).max(3).nullable(),
  special_tax_regime: z.number().refine(v => [0,1,2,3,4,5,6,9].includes(v)), dps_series: seriesSchema.nullable(),
  approx_taxes_mode: z.enum(['percent_simples','percent_by_sphere','none']), approx_simples_percent: percent,
  approx_federal_percent: percent, approx_state_percent: percent, approx_municipal_percent: percent,
  simples_iss_withholding_percent: z.number().min(1.8, 'A alíquota do ISS deve ser pelo menos 1,80%.').max(9.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-8, 'Use até duas casas decimais.').nullable().default(null),
}).superRefine((v,ctx) => {
  if (v.simples_nacional_option === 1 && v.approx_taxes_mode !== 'percent_by_sphere') ctx.addIssue({code:'custom',path:['approx_taxes_mode'],message:'Para empresas não optantes do Simples, preencha os percentuais federal, estadual e municipal (E0713).'});
  if (v.simples_iss_withholding_percent !== null && (v.simples_nacional_option !== 3 || v.simples_nacional_regime !== 1)) ctx.addIssue({code:'custom',path:['simples_iss_withholding_percent'],message:'A alíquota do ISS no Simples só pode ser informada para ME/EPP com ISS dentro do Simples (DAS).'});
  if ((v.simples_nacional_option === 3) !== (v.simples_nacional_regime !== null)) ctx.addIssue({code:'custom',path:['simples_nacional_regime'],message:'Informe o regime de apuração somente para Optante ME/EPP.'});
  const spheres = [v.approx_federal_percent,v.approx_state_percent,v.approx_municipal_percent];
  const valid = v.approx_taxes_mode === 'percent_simples' ? v.simples_nacional_option !== 1 && v.approx_simples_percent !== null && spheres.every(x=>x===null) : v.approx_taxes_mode === 'percent_by_sphere' ? v.approx_simples_percent===null && spheres.every(x=>x!==null) : v.approx_simples_percent===null && spheres.every(x=>x===null);
  if (!valid) ctx.addIssue({code:'custom',path:['approx_taxes_mode'],message:'Confira os percentuais exigidos para o modo escolhido.'});
});
const optionalCode = (size: number) => z.string().regex(new RegExp(`^[0-9]{${size}}$`)).nullable();
export const serviceProfileSchema = fiscalIds.extend({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(200),active:z.boolean(),service_code:z.string().regex(/^[0-9]{6}$/),municipal_tax_code:z.string().nullable(),nbs_code:optionalCode(9),default_description:z.string().max(2000),iss_taxation:z.number().int().min(1).max(4),immunity_type:z.number().int().min(0).max(5).nullable(),iss_withholding:z.number().int().min(1).max(3),ibscbs_operation_indicator:optionalCode(6),municipal_benefit_number:z.string().nullable()}).superRefine((v,ctx)=>{if((v.iss_taxation===2)!==(v.immunity_type!==null))ctx.addIssue({code:'custom',path:['immunity_type'],message:'Informe o tipo de imunidade somente para tributação por imunidade.'});});
export type FiscalForm = z.infer<typeof fiscalSchema>;
export type ServiceForm = z.infer<typeof serviceProfileSchema>;
export const simplesOptions = [[1,'Não optante'],[2,'Optante MEI'],[3,'Optante ME/EPP']] as const;
export const simplesRegimes = [[1,'Tributos federais e municipal pelo SN'],[2,'Federais pelo SN e ISSQN por fora do SN'],[3,'Federais e municipal por fora do SN']] as const;
export const specialRegimes = [[0,'Nenhum'],[1,'Ato Cooperado'],[2,'Estimativa'],[3,'Microempresa Municipal'],[4,'Notário ou Registrador'],[5,'Profissional Autônomo'],[6,'Sociedade de Profissionais'],[9,'Outros']] as const;
export const taxationOptions = [[1,'Operação tributável'],[2,'Imunidade'],[3,'Exportação de serviço'],[4,'Não incidência']] as const;
export const withholdingOptions = [[1,'Não retido'],[2,'Retido pelo tomador'],[3,'Retido pelo intermediário']] as const;
export const immunityOptions = [[0,'Imunidade (tipo não informado)'],[1,'Entes federativos'],[2,'Templos de qualquer culto'],[3,'Partidos políticos, sindicatos e instituições sem fins lucrativos'],[4,'Livros, jornais, periódicos e papel'],[5,'Fonogramas e videofonogramas musicais brasileiros']] as const;
export const immunityDescriptions = [
 'Imunidade (tipo não informado na nota de origem)',
 'Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)',
 'Templos de qualquer culto (CF88, Art 150, VI, b)',
 'Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c)',
 'Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)',
 'Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser. (CF88, Art 150, VI, e)',
];
export function cnpjLocked(hasCertificate: boolean, hasSeries: boolean) { return hasCertificate || hasSeries; }
export function validReadinessCertificate(c: {status:string;cnpj:string;valid_from:string;valid_until:string},cnpj:string,now=Date.now()) {return c.status==='active' && c.cnpj===cnpj && Number.isFinite(Date.parse(c.valid_from)) && Date.parse(c.valid_from)<=now && Date.parse(c.valid_until)>now;}
export const catalogNames = ['service_codes','nbs_codes','ibscbs_operation_indicators'] as const;
export type CatalogName = typeof catalogNames[number];
export type CatalogChoice = {code:string;description:string;details:unknown};
export function chooseSimples(form: FiscalForm, option: number): FiscalForm {
  return {...form, simples_nacional_option:option, simples_nacional_regime:option===3 ? (form.simples_nacional_regime ?? 1) : null,
    approx_taxes_mode:option===1?'percent_by_sphere':form.approx_taxes_mode==='none'?'none':'percent_simples',
    approx_simples_percent:option===1?null:form.approx_simples_percent,
    approx_federal_percent:option===1?form.approx_federal_percent:null,approx_state_percent:option===1?form.approx_state_percent:null,approx_municipal_percent:option===1?form.approx_municipal_percent:null,
    simples_iss_withholding_percent:option===3&&(form.simples_nacional_regime??1)===1?form.simples_iss_withholding_percent:null};
}
export function fiscalSummary(form: FiscalForm): string {
  const company=form.simples_nacional_option===1?'Empresa não optante do Simples Nacional':form.simples_nacional_option===2?'Empresa do Simples Nacional (MEI)':'Empresa do Simples Nacional (ME/EPP)';
  const regime=form.simples_nacional_option===3 ? ['ISS recolhido no DAS','ISS recolhido fora do Simples','tributos federais e ISS recolhidos fora do Simples'][(form.simples_nacional_regime??1)-1] : null;
  const pct=(v:number|null)=>v===null?'pendente':`${v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  const taxes=form.approx_taxes_mode==='none'?'tributos aproximados não informados':form.approx_taxes_mode==='percent_simples'?`tributos aproximados de ${pct(form.approx_simples_percent)}`:`tributos aproximados: federal ${pct(form.approx_federal_percent)}, estadual ${pct(form.approx_state_percent)} e municipal ${pct(form.approx_municipal_percent)}`;
  return [company,regime,taxes].filter(Boolean).join(', ')+'.';
}