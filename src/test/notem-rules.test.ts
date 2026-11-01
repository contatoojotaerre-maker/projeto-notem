import { describe,it,expect } from 'vitest';
import { canManageOrganization,canEditCompany,digits,isValidCnpj,companySchema } from '@/lib/notem';
describe('Regras da fundação notem',()=>{
 it('valida dígitos verificadores de CNPJ',()=>{expect(isValidCnpj('11.222.333/0001-81')).toBe(true);expect(isValidCnpj('11.222.333/0001-82')).toBe(false);expect(isValidCnpj('00000000000000')).toBe(false);});
 it('normaliza CNPJ em números',()=>{expect(digits('11.222.333/0001-81')).toBe('11222333000181');});
 it('viewer não edita empresa',()=>{expect(canEditCompany('viewer')).toBe(false);expect(canEditCompany('operator')).toBe(true);});
 it('Equipe e Organização só para owner/admin ou administrador global',()=>{expect(canManageOrganization('owner')).toBe(true);expect(canManageOrganization('admin')).toBe(true);for(const role of ['operator','viewer','developer'])expect(canManageOrganization(role)).toBe(false);expect(canManageOrganization(undefined,true)).toBe(true);});
 it('usuário sem papel não edita empresa',()=>{expect(canEditCompany()).toBe(false);});
 it('formulário exige município IBGE de 7 dígitos',()=>{const input={organization_id:'11111111-1111-4111-8111-111111111111',cnpj:'11222333000181',legal_name:'Teste',email:'',phone:'',postal_code:'',street:'',number:'',complement:'',district:'',municipality_ibge_code:'1234567'};expect(companySchema.safeParse(input).success).toBe(true);expect(companySchema.safeParse({...input,municipality_ibge_code:'123'}).success).toBe(false);});
});