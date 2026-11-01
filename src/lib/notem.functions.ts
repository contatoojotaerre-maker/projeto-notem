import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { companySchema, roles } from './notem';

export const getWorkspace = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [profile, organizations, members, admin, invitations] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id',context.userId).single(),
    context.supabase.from('organizations').select('*').order('name'),
    context.supabase.from('organization_members').select('*').eq('user_id',context.userId),
    context.supabase.rpc('is_platform_admin'), context.supabase.rpc('pending_invitations'),
  ]);
  for (const result of [profile,organizations,members,admin,invitations]) if (result.error) throw new Error(result.error.message);
  if (!admin.data && !members.data?.length && !invitations.data?.length) throw new Error('Acesso não autorizado. Solicite um convite ao administrador da sua organização.');
  return { profile: profile.data, organizations: organizations.data ?? [], memberships: members.data ?? [], isAdmin: admin.data === true, invitations: invitations.data ?? [], email: String(context.claims.email ?? '') };
});
export const finishSignIn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const pending = await context.supabase.rpc('pending_invitations');
  if (pending.error) throw new Error(pending.error.message);
  for (const invitation of pending.data ?? []) if (!invitation.requires_explicit_acceptance) {
    const result = await context.supabase.rpc('accept_invitation',{ invitation_id: invitation.id });
    if (result.error) throw new Error(result.error.message);
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
  if (result.error) throw new Error(result.error.message);
  return { ok:true };
});
export const getCompanies = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),search:z.string().default(''),page:z.number().int().min(0).default(0)})).handler(async ({context,data}) => {
  let query=context.supabase.from('companies').select('*',{count:'exact'}).eq('organization_id',data.organization_id).order('legal_name').range(data.page*30,data.page*30+29);
  const search=data.search.replace(/[%_,().]/g,'').trim();
  if(search) query=query.or(`legal_name.ilike.%${search}%,trade_name.ilike.%${search}%,cnpj.ilike.%${search}%`);
  const result=await query; if(result.error) throw new Error(result.error.message); return {rows:result.data ?? [],count:result.count ?? 0};
});
export const getCompany = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),organization_id:z.string().uuid()})).handler(async({context,data})=>{
  const result=await context.supabase.from('companies').select('*, municipalities(*)').eq('id',data.id).eq('organization_id',data.organization_id).single();if(result.error)throw new Error('Empresa não encontrada ou acesso não autorizado.');return result.data;
});
export const saveCompany = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(companySchema).handler(async({context,data})=>{
  const {id,...fields}=data;
  // State and audit fields are authoritative database-trigger outputs, not form inputs.
  const result=id ? await context.supabase.from('companies').update(fields).eq('id',id).eq('organization_id',fields.organization_id).select('id').single() : await context.supabase.from('companies').insert({...fields,state:'',created_by:context.userId,updated_by:context.userId}).select('id').single();
  if(result.error)throw new Error(result.error.code==='23505'?'Este CNPJ já está cadastrado nesta organização.':'Não foi possível salvar. Confira os dados e sua permissão.');return result.data;
});
export const searchMunicipalities = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({search:z.string().max(100)})).handler(async({context,data})=>{
  const result=await context.supabase.from('municipalities').select('*').ilike('name',`%${data.search.replace(/[%_]/g,'')}%`).order('name').limit(30);if(result.error)throw new Error(result.error.message);return result.data ?? [];
});
export const createOrganization = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({name:z.string().trim().min(1),slug:z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)})).handler(async({context,data})=>{
  const result=await context.supabase.from('organizations').insert({...data,created_by:context.userId}).select('*').single();if(result.error)throw new Error(result.error.code==='23505'?'Este endereço já está em uso.':'Você não pode criar esta organização.');return result.data;
});
export const renameOrganization = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),name:z.string().trim().min(1)})).handler(async({context,data})=>{
  const result=await context.supabase.from('organizations').update({name:data.name}).eq('id',data.id).select('id').single();if(result.error)throw new Error('Não foi possível alterar a organização.');return result.data;
});
export const getTeam = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid()})).handler(async({context,data})=>{
  const [admin,role]=await Promise.all([context.supabase.rpc('is_platform_admin'),context.supabase.rpc('has_org_role',{org_id:data.organization_id,roles:['owner','admin']})]);
  if(!admin.data&&!role.data)throw new Error('Acesso não autorizado.');
  const result=await context.supabase.rpc('organization_team',{org_id:data.organization_id});if(result.error)throw new Error(result.error.message);return result.data ?? [];
});
export const inviteFirstMember = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid(),email:z.string().email().transform(v=>v.trim().toLowerCase()),role:z.enum(roles)})).handler(async({context,data})=>{
  const allowed=await context.supabase.rpc('is_platform_admin');if(allowed.error||!allowed.data)throw new Error('Acesso não autorizado.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const members=await supabaseAdmin.from('organization_members').select('id',{count:'exact',head:true}).eq('organization_id',data.organization_id);if(members.error)throw new Error(members.error.message);if(members.count)throw new Error('Esta organização já tem membros. Convites adicionais estarão disponíveis em uma próxima fase.');
  let exists=false;
  for(let page=1;;page++) {const users=await supabaseAdmin.auth.admin.listUsers({page,perPage:1000});if(users.error)throw new Error('Não foi possível verificar o convite.');if(users.data.users.some(u=>u.email?.toLowerCase()===data.email)){exists=true;break;}if(users.data.users.length<1000)break;}
  const result=await supabaseAdmin.from('invitations').insert({...data,invited_by:context.userId,requires_explicit_acceptance:exists}).select('id').single();if(result.error)throw new Error(result.error.code==='23505'?'Já existe um convite pendente para este e-mail.':result.error.message);
  if(!exists){const origin=new URL(getRequest().url).origin;const sent=await supabaseAdmin.auth.admin.inviteUserByEmail(data.email,{redirectTo:`${origin}/definir-senha`});if(sent.error){await supabaseAdmin.from('invitations').update({status:'revoked'}).eq('id',result.data.id);throw new Error('O e-mail não foi enviado. Verifique as configurações de envio no Supabase e tente novamente.');}}
  return {existing:exists,notice:exists?'Convite pendente. O usuário poderá aceitá-lo ao entrar. O aviso por e-mail aguarda a configuração do domínio de envio.':'Convite enviado por e-mail.'};
});