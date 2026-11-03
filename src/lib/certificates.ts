// Client-safe certificate and agreement rules (no secrets here).
export const MAX_CERTIFICATE_BYTES = 100 * 1024;
export const AGREEMENT_COOLDOWN_MS = 60_000;

export function canUseCertificate(role?: string, platformAdmin = false) {
  return platformAdmin || role === 'owner' || role === 'admin';
}

export type CertificateSituation = { kind: 'valid' | 'expiring' | 'expired' | 'not_yet'; label: string; days: number };
export function certificateSituation(validFrom: string | Date, validUntil: string | Date, now = new Date()): CertificateSituation {
  const until = new Date(validUntil).getTime(); const from = new Date(validFrom).getTime(); const t = now.getTime();
  const days = Math.ceil((until - t) / 86_400_000);
  if (t >= until) return { kind: 'expired', label: 'Vencido', days };
  if (t < from) return { kind: 'not_yet', label: 'Validade ainda não iniciada', days };
  if (days <= 30) return { kind: 'expiring', label: `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`, days };
  return { kind: 'valid', label: 'Válido', days };
}

export const transmissorErrorMessages: Record<string, string> = {
  SENHA_OU_ARQUIVO_INVALIDO: 'Senha incorreta ou arquivo inválido.',
  ARQUIVO_INVALIDO: 'Arquivo de certificado inválido.',
  SEM_CHAVE_PRIVADA: 'O arquivo não contém a chave privada do certificado.',
  CERTIFICADO_VENCIDO: 'Este certificado está vencido.',
  CERTIFICADO_AINDA_NAO_VALIDO: 'A validade deste certificado ainda não começou.',
  CNPJ_NAO_ENCONTRADO: 'Não foi encontrado CNPJ neste certificado.',
  CNPJ_DIVERGENTE: 'O CNPJ do certificado é diferente do cadastro da empresa.',
  REQUISICAO_INVALIDA: 'Requisição inválida ao serviço de transmissão.',
  ENVELOPE_INVALIDO: 'O certificado guardado não pôde ser usado. Envie o certificado novamente.',
  TLS: 'A conexão segura com o governo falhou (TLS).',
  TEMPO_ESGOTADO: 'O governo não respondeu a tempo.',
  CONEXAO: 'Não foi possível conectar ao governo.',
  INDISPONIVEL: 'Serviço de transmissão indisponível. Tente novamente em instantes.',
  CREDENCIAL: 'O painel não conseguiu se identificar no serviço de transmissão. Contate o administrador da plataforma.',
};
export const translateTransmissorError = (code?: string | null) => transmissorErrorMessages[code ?? ''] ?? 'Falha inesperada no serviço de transmissão.';

export const toTransmissorEnvironment = (env: 'production' | 'sandbox') => (env === 'production' ? 'producao' : 'homologacao');

export function cooldownRemaining(lastAt: string | null | undefined, now = Date.now()) {
  if (!lastAt) return 0;
  return Math.max(0, new Date(lastAt).getTime() + AGREEMENT_COOLDOWN_MS - now);
}

/** Shows a government value as received: booleans as Sim/Não, numbers as "código X", everything else verbatim. */
export function formatGovernmentValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return `código ${value}`;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatAgreementField(field:string,value:unknown) {
  if(['aderenteAmbienteNacional','aderenteEmissorNacional','aderenteMAN'].includes(field)) {
    if(value===1)return 'Sim';if(value===0)return 'Não';if(value===-1)return 'Não informado';
  }
  return formatGovernmentValue(value);
}
export function agreementUnavailableMessage(status:number|null|undefined,message:unknown,environment:'production'|'sandbox') {
  if(status!==404||typeof message!=='string')return null;
  const text=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!/convenio/.test(text)||!/(nao\s+(esta\s+)?ativo|inativ|nao\s+possui\s+convenio\s+ativo|convenio\s+nao\s+ativ)/.test(text))return null;
  return environment==='sandbox'?'Homologação indisponível neste município':'Município não atendido';
}

export const agreementFieldLabels: Record<string, string> = {
  aderenteEmissorNacional: 'Aderente ao emissor nacional',
  aderenteAmbienteNacional: 'Aderente ao ambiente nacional',
  situacaoEmissaoPadraoContribuintesRFB: 'Situação de emissão padrão dos contribuintes (RFB)',
  aderenteMAN: 'Aderente ao MAN',
  permiteAproveitametoDeCreditos: 'Permite aproveitamento de créditos',
  tipoConvenioDeserializationSetter: 'Tipo de convênio',
  tipoConvenio: 'Tipo de convênio',
};

const SENSITIVE = ['pfx_base64', 'senha', 'envelope', 'nonce', 'dados', 'data', 'key_version'];
/** Removes any secret-bearing key, recursively. Applied to everything returned to the browser. */
export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitive) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SENSITIVE.includes(k)).map(([k, v]) => [k, stripSensitive(v)])) as T;
  return value;
}
