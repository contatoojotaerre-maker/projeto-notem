import { describe, expect, it } from 'vitest';
import { addressLines, formatDocument, takerRows, valueRows } from '@/lib/note-display';
import { dateBr, dateTimeBr } from '@/lib/br-format';

describe('rótulos da nota', () => {
  it('mesmos rótulos para nota da notem e de fora', () => {
    const notem = valueRows({ servico: '1749.00', base_calculo: '1749.00', aliquota_iss: '2.5', valor_iss: '43.73', valor_liquido: '1705.27', iss_retido: false });
    expect(notem).toEqual([['Valor do serviço', 'R$ 1.749,00'], ['Base de cálculo', 'R$ 1.749,00'], ['Alíquota do ISS', '2,50%'], ['ISS', 'R$ 43,73'], ['Valor líquido', 'R$ 1.705,27'], ['ISS retido', 'Não']]);
    const externa = valueRows({ servico: '100', base_calculo: null, aliquota_iss: null, valor_iss: null, valor_liquido: null, iss_retido: true });
    expect(externa.map(r => r[0])).toEqual(notem.map(r => r[0]));
    expect(externa[1]).toEqual(['Base de cálculo', 'Não destacado']); expect(externa[5]).toEqual(['ISS retido', 'Sim']);
  });
  it('descontos aparecem só quando informados', () => {
    expect(valueRows({ servico: '10', desconto_incondicionado: '1.5' }).map(r => r[0])).toEqual(['Valor do serviço', 'Desconto incondicionado']);
  });
  it('tomador: tipo por extenso e documento com máscara', () => {
    expect(takerRows({ tipo: 'pj', documento: '12345678000195', nome: 'Cliente' })).toEqual([['Nome', 'Cliente'], ['Tipo', 'Pessoa jurídica'], ['CNPJ', '12.345.678/0001-95']]);
    expect(takerRows({ tipo: 'pf', documento: '52998224725', nome: 'Ana' })[2]).toEqual(['CPF', '529.982.247-25']);
    expect(takerRows({ tipo: 'estrangeiro', nif: 'X1', nome: 'Bob' })[1]).toEqual(['Tipo', 'Estrangeiro']);
    expect(formatDocument('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
  it('endereço em linhas', () => {
    expect(addressLines({ logradouro: 'Rua A', numero: '10', complemento: 'Sala 2', bairro: 'Centro', codigo_municipio: '4212809', cep: '95560000' }, 'Passo de Torres/SC'))
      .toEqual(['Rua A, 10 — Sala 2', 'Centro', 'Passo de Torres/SC', 'CEP 95560-000']);
    expect(addressLines(null)).toEqual([]);
  });
  it('datas no horário de Brasília', () => {
    expect(dateTimeBr('2026-11-16T19:00:00-03:00')).toBe('16/11/2026 19:00');
    expect(dateTimeBr('2026-11-17T01:30:00Z')).toBe('16/11/2026 22:30');
    expect(dateBr('2026-11-01')).toBe('01/11/2026');
  });
});
