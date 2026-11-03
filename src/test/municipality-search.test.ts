import { describe, expect, it } from 'vitest';
import { municipalitySearchState, municipalitySearchTerm } from '@/lib/municipality-search';

describe('Municipality search rules', () => {
  it('requires at least two characters', () => {
    expect(municipalitySearchTerm('s').eligible).toBe(false);
    expect(municipalitySearchTerm('sa').eligible).toBe(true);
  });
  it('uses the code path only for digits', () => {
    expect(municipalitySearchTerm('4212254').mode).toBe('code');
    expect(municipalitySearchTerm('42').mode).toBe('code');
    expect(municipalitySearchTerm('sao joao').mode).toBe('name');
    expect(municipalitySearchTerm('42a').mode).toBe('name');
  });
  it('distinguishes missing catalog from no match', () => {
    expect(municipalitySearchState('sao joao', true, false, false, 0)).toBe('catalog-empty');
    expect(municipalitySearchState('zzzz', false, false, false, 0)).toBe('no-results');
  });
  it('prioritizes a confirmed empty catalog over short input', () => {
    expect(municipalitySearchState('', true, false, false, 0)).toBe('catalog-empty');
    expect(municipalitySearchState('s', false, false, false, 0)).toBe('too-short');
  });
  it('does not treat failures or loading as no matches', () => {
    expect(municipalitySearchState('sa', undefined, false, true, 0)).toBe('error');
    expect(municipalitySearchState('sa', undefined, true, false, 0)).toBe('loading');
    expect(municipalitySearchState('sa', false, false, false, 1)).toBe('results');
  });
});