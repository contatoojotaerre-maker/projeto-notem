import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { appLink } from '@/lib/app-url';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { companySchema, roles, organizationSchema } from './notem';
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
export const getCompanies = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),search:z.string().default(''),page:z.number().int().min(0).default(0)})).handler(async ({context,data}) => {
  let query=context.supabase.from('companies').select('*',{count:'exact'}).eq('organization_id',data.organization_id).order('legal_name').range(data.page*30,data.page*30+29);
  const search=data.search.replace(/[%_,().]/g,'').trim();
  if(search) query=query.or(`legal_name.ilike.%${search}%,trade_name.ilike.%${search}%,cnpj.ilike.%${search}%`);
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
