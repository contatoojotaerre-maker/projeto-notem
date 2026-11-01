import { describe,it,expect } from 'vitest';
import { slugify,slugSchema,organizationSchema } from '@/lib/notem';
describe('Nova organização',()=>{
 it('gera endereço sem acentos e com hífens',()=>{expect(slugify('Grupo  Jotá Ltda.')).toBe('grupo-jota-ltda');expect(slugify('OneDesp')).toBe('onedesp');});
 it('endereço entre 3 e 50 caracteres',()=>{expect(slugSchema.safeParse('ab').error?.issues[0].message).toBe('Informe um endereço com pelo menos 3 caracteres');expect(slugSchema.safeParse('a'.repeat(51)).success).toBe(false);expect(slugSchema.safeParse('abc').success).toBe(true);expect(slugify('a'.repeat(60)).length).toBe(50);});
 it('endereço só com minúsculas, números e hífen',()=>{expect(slugSchema.safeParse('Abc').success).toBe(false);expect(slugSchema.safeParse('a_bc').success).toBe(false);});
 it('tipo obrigatório e só partner/company',()=>{expect(organizationSchema.safeParse({name:'X',slug:'xyz'}).success).toBe(false);expect(organizationSchema.safeParse({name:'X',slug:'xyz',type:'other'}).success).toBe(false);expect(organizationSchema.safeParse({name:'X',slug:'xyz',type:'partner'}).success).toBe(true);});
});
