import { describe,it,expect } from 'vitest';
import { organizationSchema } from '@/lib/notem';
describe('Nova organização',()=>{
 it('formulário só com nome e tipo; endereço informado é descartado',()=>{const r=organizationSchema.safeParse({name:'OneDesp',type:'partner',slug:'escolhido'});expect(r.success).toBe(true);expect(r.data).toEqual({name:'OneDesp',type:'partner'});});
 it('nome obrigatório',()=>{expect(organizationSchema.safeParse({name:'  ',type:'company'}).success).toBe(false);});
 it('tipo obrigatório e só partner/company',()=>{expect(organizationSchema.safeParse({name:'X'}).success).toBe(false);expect(organizationSchema.safeParse({name:'X',type:'other'}).success).toBe(false);expect(organizationSchema.safeParse({name:'X',type:'company'}).success).toBe(true);});
});
