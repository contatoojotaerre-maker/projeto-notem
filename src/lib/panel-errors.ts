// Panel error kinds. Loaders throw notFound() for anything missing or belonging to another organization
// (never confirming it exists) and PanelAccessDenied when the role cannot open the page.
export class PanelAccessDenied extends Error { constructor() { super('PANEL_ACCESS_DENIED'); this.name = 'PanelAccessDenied'; } }
export const isAccessDenied = (e: unknown) => e instanceof PanelAccessDenied || (e instanceof Error && e.name === 'PanelAccessDenied');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Ids in the address are checked before any request: a malformed one is simply "not found". */
export const isPanelId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
/** Server refusals that mean "missing or not yours" (the panel shows them as not found). */
export const isMissingError = (e: unknown) => e instanceof Error && /não encontrad|não autorizad|acesso negado|inválid/i.test(e.message);
