import { createServerFn } from '@tanstack/react-start';
import { z, email as zEmail, integer } from './validation';
import { appLink } from '@/lib/app-url';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { companySchema, normalizeCnpj, roles, organizationSchema } from './notem';
import { municipalitySearchTerm } from './municipality-search';
import { CNPJ_LOCK_MESSAGE } from './fiscal';

export const getWorkspace = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [profile, organizations, members, admin, invitations] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id',context.userId).single(),
    context.supabase.from('organizations').select('*').order('name'),
    context.supabase.from('organization_members').select('*').eq('user_id',context.userId),
    context.supabase.rpc('is_platform_admin'), context.supabase.rpc('pending_invitations'),
  ]);
  for (const result of [profile,organizations,members,admin,invitations]) if (result.error) {console.error('notem: database error',result.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};
  if (!admin.data && !members.data?.length && !invitations.data?.length) throw new Error('Acesso não autorizado. Solicite um convite ao administrador da sua organização.');
  return { profile: profile.data, organizations: organizations.data ?? [], memberships: members.data ?? [], isAdmin: admin.data === true, invitations: invitations.data ?? [], email: String(context.claims.email ?? '') };
});
export const finishSignIn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const pending = await context.supabase.rpc('pending_invitations');
  if (pending.error) {console.error('notem: database error',pending.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};
  for (const invitation of pending.data ?? []) if (!invitation.requires_explicit_acceptance) {
    const result = await context.supabase.rpc('accept_invitation',{ invitation_id: invitation.id });
    if (result.error) {console.error('notem: database error',result.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};
  }
  const [admin, memberships] = await Promise.all([context.supabase.rpc('is_platform_admin'), context.supabase.from('organization_members').select('id').eq('user_id',context.userId).limit(1)]);
  if (!admin.data && !memberships.data?.length && !pending.data?.length) throw new Error('Acesso não autorizado. Solicite um convite ao administrador da sua organização.');
  return { ok: true };
});
export const acceptInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ context,data }) => {
  const result = await context.supabase.rpc('accept_invitation',{ invitation_id: data.id });
  if (result.error) throw new Error('Não foi possível aceitar este convite.');
  return result.data;
});
export const updatePreferences = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ theme: z.enum(['dark','light']).optional(),environment: z.enum(['production','sandbox']).optional(),last_organization_id: z.string().uuid().optional() })).handler(async ({ context,data }) => {
  if (data.last_organization_id) {
    const org = await context.supabase.from('organizations').select('id').eq('id',data.last_organization_id).single();
    if (org.error) throw new Error('Organização não autorizada.');
  }
  const result = await context.supabase.from('profiles').update({ ...(data.theme ? {theme:data.theme}:{}), ...(data.environment ? {environment:data.environment}:{}), ...(data.last_organization_id ? {last_organization_id:data.last_organization_id}:{}) }).eq('id',context.userId);
  if (result.error) {console.error('notem: database error',result.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};
  return { ok:true };
});
export const getCompanies = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),search:z.string().default(''),page:integer().min(0).default(0)})).handler(async ({context,data}) => {
  let query=context.supabase.from('companies').select('*',{count:'exact'}).eq('organization_id',data.organization_id).order('legal_name').range(data.page*30,data.page*30+29);
  const search=data.search.replace(/[%_,().]/g,'').trim();
  if(search){const cnpj=normalizeCnpj(search);query=query.or(`legal_name.ilike.%${search}%,trade_name.ilike.%${search}%,cnpj.ilike.%${search}%${cnpj&&cnpj!==search?`,cnpj.ilike.%${cnpj}%`:''}`);}
  const result=await query; if(result.error) {console.error('notem: database error',result.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')}; return {rows:result.data ?? [],count:result.count ?? 0};
});
export const getCompany = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),organization_id:z.string().uuid()})).handler(async({context,data})=>{
  const result=await context.supabase.from('companies').select('*, municipalities(*)').eq('id',data.id).eq('organization_id',data.organization_id).single();if(result.error)throw new Error('Empresa não encontrada ou acesso não autorizado.');
  const [cert,series]=await Promise.all([context.supabase.from('company_certificates').select('id').eq('company_id',data.id).eq('organization_id',data.organization_id).limit(1),context.supabase.from('dps_sequences').select('series').eq('company_id',data.id).eq('organization_id',data.organization_id).limit(1)]);
  if(cert.error||series.error)throw new Error('Não foi possível carregar a proteção do CNPJ.');
  const integration=result.data.change_origin==='api'&&result.data.changed_by_integration_id?await context.supabase.from('integrations').select('name').eq('id',result.data.changed_by_integration_id).maybeSingle():null;
  return {...result.data,cnpj_locked:Boolean(cert.data?.length||series.data?.length),changed_by_integration_name:integration?.data?.name??null};
});
/** Panel readiness (same calculation as GET /api/v1/empresas/{id}/situacao). */
export const getCompanyReadiness = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),organization_id:z.string().uuid(),environment:z.enum(['sandbox','production'])})).handler(async({context,data})=>{
  const own=await context.supabase.from('companies').select('id').eq('id',data.id).eq('organization_id',data.organization_id).maybeSingle();if(own.error||!own.data)throw new Error('Empresa não encontrada ou acesso não autorizado.');
  const {loadReadiness}=await import('./readiness.server');const r=await loadReadiness(context.supabase,data.id,data.environment);return r.readiness;
});
export const setCompanyActive = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),organization_id:z.string().uuid(),active:z.boolean()})).handler(async({context,data})=>{
  const r=await context.supabase.from('companies').update({active:data.active}).eq('id',data.id).eq('organization_id',data.organization_id).select('id').single();if(r.error)throw new Error('Não foi possível alterar a situação da empresa. Confira sua permissão.');
  await (await import('./readiness.server')).panelRefreshReadiness(data.id);return {ok:true};
});
export const saveCompany = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(companySchema).handler(async({context,data})=>{
  const {id,...fields}=data;
  // State and audit fields are authoritative database-trigger outputs, not form inputs.
  const result=id ? await context.supabase.from('companies').update(fields).eq('id',id).eq('organization_id',fields.organization_id).select('id').single() : await context.supabase.from('companies').insert({...fields,state:'',created_by:context.userId,updated_by:context.userId}).select('id').single();
  if(result.error)throw new Error(result.error.message.includes(CNPJ_LOCK_MESSAGE)?CNPJ_LOCK_MESSAGE:result.error.code==='23505'?'Este CNPJ já está cadastrado nesta organização.':'Não foi possível salvar. Confira os dados e sua permissão.');await (await import('./readiness.server')).panelRefreshReadiness(result.data.id);return result.data;
});
export const searchMunicipalities = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({search:z.string().max(100)})).handler(async({context,data})=>{
  const { term, eligible } = municipalitySearchTerm(data.search);
  const catalog = await context.supabase.from('municipalities').select('ibge_code').limit(1);
  if (catalog.error) throw new Error('Não foi possível consultar o catálogo de municípios.');
  const catalogEmpty = !catalog.data?.length;
  if (catalogEmpty || !eligible) return { rows: [], catalogEmpty };
  const result = await context.supabase.rpc('search_municipality_catalog', { search_term: term });
  if (result.error) throw new Error('Não foi possível buscar municípios. Tente novamente.');
  return { rows: result.data ?? [], catalogEmpty };
});
export const createOrganization = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(organizationSchema).handler(async({context,data})=>{
  // The database generates the immutable panel address; names may repeat.
  const result=await context.supabase.from('organizations').insert({name:data.name,type:data.type,created_by:context.userId}).select('*').single();if(result.error)throw new Error('Você não pode criar esta organização.');
  const same=await context.supabase.from('organizations').select('id',{count:'exact',head:true}).ilike('name',data.name.replace(/[\\%_]/g,m=>'\\'+m)).neq('id',result.data.id);
  return {...result.data,duplicateName:!same.error&&(same.count??0)>0};
});
export const renameOrganization = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),name:z.string().trim().min(1)})).handler(async({context,data})=>{
  const result=await context.supabase.from('organizations').update({name:data.name}).eq('id',data.id).select('id').single();if(result.error)throw new Error('Não foi possível alterar a organização.');return result.data;
});
export const getTeam = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid()})).handler(async({context,data})=>{
  const [admin,role]=await Promise.all([context.supabase.rpc('is_platform_admin'),context.supabase.rpc('has_org_role',{org_id:data.organization_id,roles:['owner','admin']})]);
  if(!admin.data&&!role.data)throw new Error('Acesso não autorizado.');
  const result=await context.supabase.rpc('organization_team',{org_id:data.organization_id});if(result.error){console.error('notem: database error',result.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};return result.data ?? [];
});
export const inviteFirstMember = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),email:zEmail().transform(v=>v.trim().toLowerCase()),role:z.enum(roles)})).handler(async({context,data})=>{
  const allowed=await context.supabase.rpc('is_platform_admin');if(allowed.error||!allowed.data)throw new Error('Acesso não autorizado.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const members=await supabaseAdmin.from('organization_members').select('id',{count:'exact',head:true}).eq('organization_id',data.organization_id);if(members.error){console.error('notem: database error',members.error.code);throw new Error('Não foi possível carregar ou salvar os dados. Tente novamente.')};if(members.count)throw new Error('Esta organização já tem membros. Convites adicionais estarão disponíveis em uma próxima fase.');
  let exists=false;
  for(let page=1;;page++) {const users=await supabaseAdmin.auth.admin.listUsers({page,perPage:1000});if(users.error)throw new Error('Não foi possível verificar o convite.');if(users.data.users.some(u=>u.email?.toLowerCase()===data.email)){exists=true;break;}if(users.data.users.length<1000)break;}
  // An expired invitation no longer blocks a new one for the same e-mail.
  await supabaseAdmin.from('invitations').update({status:'revoked',revoked_at:new Date().toISOString()}).eq('organization_id',data.organization_id).eq('email',data.email).eq('status','pending').lt('expires_at',new Date().toISOString());
  const result=await supabaseAdmin.from('invitations').insert({...data,invited_by:context.userId,requires_explicit_acceptance:exists}).select('id').single();if(result.error)throw new Error(result.error.code==='23505'?'Já existe um convite pendente para este e-mail.':'Não foi possível enviar o convite. Tente novamente.');
  if(!exists){const sent=await supabaseAdmin.auth.admin.inviteUserByEmail(data.email,{redirectTo:appLink('/definir-senha')});if(sent.error){await supabaseAdmin.from('invitations').update({status:'revoked'}).eq('id',result.data.id);throw new Error('O e-mail não foi enviado. Verifique as configurações de envio no Supabase e tente novamente.');}}
  return {existing:exists,notice:exists?'Convite pendente. O usuário poderá aceitá-lo ao entrar. O aviso por e-mail aguarda a configuração do domínio de envio.':'Convite enviado por e-mail.'};
});

/** Pending invitations (platform administration), with their expiry. */
export const getPendingInvitations = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const allowed=await context.supabase.rpc('is_platform_admin');if(allowed.error||!allowed.data)throw new Error('Acesso não autorizado.');
  const r=await context.supabase.from('invitations').select('id,organization_id,email,role,created_at,expires_at').eq('status','pending').order('created_at',{ascending:false}).limit(200);
  if(r.error){console.error('notem: database error',r.error.code);throw new Error('Não foi possível carregar os convites.');}
  return r.data??[];
});
/** Revokes a pending invitation; who revoked is recorded (also in the administrative trail). */
export const revokeInvitation = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({context,data})=>{
  const allowed=await context.supabase.rpc('is_platform_admin');if(allowed.error||!allowed.data)throw new Error('Acesso não autorizado.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const r=await supabaseAdmin.from('invitations').update({status:'revoked',revoked_at:new Date().toISOString(),revoked_by:context.userId}).eq('id',data.id).eq('status','pending').select('id').maybeSingle();
  if(r.error){console.error('notem: database error',r.error.code);throw new Error('Não foi possível revogar o convite.');}
  if(!r.data)throw new Error('Este convite não está mais pendente.');
  return {ok:true};
});
/** Registration changes made with sandbox keys that the organization has not acknowledged yet (last 30 days). */
export const getSandboxChanges = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid()})).handler(async({context,data})=>{
  const since=new Date(Date.now()-30*86400000).toISOString();
  const [rows,manage,admin]=await Promise.all([
    context.supabase.from('sandbox_change_audit').select('id,item,action,integration_name,company_id,created_at,companies(legal_name)').eq('organization_id',data.organization_id).is('acknowledged_at',null).gte('created_at',since).order('created_at',{ascending:false}).limit(20),
    context.supabase.rpc('has_org_role',{org_id:data.organization_id,roles:['owner','admin']}),context.supabase.rpc('is_platform_admin')]);
  if(rows.error){console.error('notem: database error',rows.error.code);throw new Error('Não foi possível carregar os avisos.');}
  return {rows:(rows.data??[]).map(r=>({id:r.id,item:r.item,action:r.action,integration:r.integration_name,company:(r.companies as {legal_name?:string}|null)?.legal_name??null,created_at:r.created_at})),canAcknowledge:manage.data===true||admin.data===true};
});
export const acknowledgeSandboxChanges = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),ids:z.array(z.string().uuid()).min(1).max(50)})).handler(async({context,data})=>{
  const r=await context.supabase.from('sandbox_change_audit').update({acknowledged_at:new Date().toISOString(),acknowledged_by:context.userId}).eq('organization_id',data.organization_id).in('id',data.ids).is('acknowledged_at',null).select('id');
  if(r.error){console.error('notem: database error',r.error.code);throw new Error('Somente proprietários e administradores podem marcar os avisos como lidos.');}
  return {count:r.data?.length??0};
});
