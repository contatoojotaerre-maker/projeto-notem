export function municipalitySearchTerm(value: string) {
  const term = value.trim();
  return { term, eligible: term.length >= 2, mode: /^[0-9]+$/.test(term) ? 'code' as const : 'name' as const };
}

export function municipalitySearchState(term: string, catalogEmpty: boolean | undefined, fetching: boolean, failed: boolean, count: number) {
  if (catalogEmpty === true) return 'catalog-empty';
  if (failed) return 'error';
  if (!municipalitySearchTerm(term).eligible) return 'too-short';
  if (fetching || catalogEmpty === undefined) return 'loading';
  return count > 0 ? 'results' : 'no-results';
}