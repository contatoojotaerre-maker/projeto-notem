import type { GovernmentReply } from './invoices';
export const MAX_EXTERNAL_DPS_RETRIES=5;
export function explicitExternalDps(reply:GovernmentReply){const rows=reply.corpo_json?.['erros']??reply.corpo_json?.['Erros'];return reply.status===400&&Array.isArray(rows)&&rows.length>0&&rows.every(e=>e&&typeof e==='object'&&(e['codigo']??e['Codigo'])==='E0014');}