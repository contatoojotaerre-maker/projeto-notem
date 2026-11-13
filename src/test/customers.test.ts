import { describe, it, expect } from 'vitest';
import { customerSchema, validCpf } from '../lib/customers';
describe('Tomadores E1', () => {
  it('valida CPF e recusa dígitos inválidos', () => { expect(validCpf('52998224725')).toBe(true); expect(validCpf('52998224724')).toBe(false); });
  it('valida PJ com CNPJ', () => { expect(customerSchema.safeParse({ tipo: 'pj', documento: '11222333000181', nome: 'Exemplo' }).success).toBe(true); expect(customerSchema.safeParse({ tipo: 'pj', documento: '11222333000180', nome: 'Exemplo' }).success).toBe(false); });
  it('estrangeiro exige NIF ou motivo exclusivo', () => { expect(customerSchema.safeParse({ tipo: 'estrangeiro', nome: 'Exemplo', motivo_sem_nif: 'dispensado' }).success).toBe(true); expect(customerSchema.safeParse({ tipo: 'estrangeiro', nome: 'Exemplo', nif: '123', motivo_sem_nif: 'dispensado' }).success).toBe(false); });
  it('endereço estrangeiro exige estado/província e demais campos XSD', () => { expect(customerSchema.safeParse({ tipo: 'estrangeiro', nome: 'Exemplo', nif: '123', endereco: { pais: 'US', cidade: 'Miami', endereco_livre: 'Rua', codigo_postal: '33101' } }).success).toBe(false); });
});