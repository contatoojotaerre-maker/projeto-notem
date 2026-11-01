// prova-mtls v4 — função TEMPORÁRIA de diagnóstico da notem. APAGUE após o teste.
// Usa um certificado autoassinado DESCARTÁVEL, sem valor, gerado apenas para este teste.
// Não acessa banco nem segredos. Só aceita GET.

const CERT_TESTE = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUA7Ibp25q7V3/yhrBMW8a3q0srpMwDQYJKoZIhvcNAQEL
BQAwIjEgMB4GA1UEAwwXbm90ZW0tdGVzdGUtZGVzY2FydGF2ZWwwHhcNMjYxMTAx
MjI0NDE1WhcNMjYxMTA0MjI0NDE1WjAiMSAwHgYDVQQDDBdub3RlbS10ZXN0ZS1k
ZXNjYXJ0YXZlbDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANt3nR8/
ufxPMHWPdApCV8H5WxZxKMGjbvbLCffJKbyNTvJUUen88sExSbF+XMDMXbDRB57V
wq11qqjmyZaoBCKuJhDS02PMMMxUmXvDgqpWFsa/cZLQaG+Qh4WX36a7PrCI9nsj
1mfNZvV4uMDxkNNTOcx92sNntFD+ThUwvFCP645x6FoDGMhguyFrmrpNZDHXGGMF
VZpCihxcRj4AVy2TRU2lZC4Sp7/lVwo3UMCyK1GjQCkf6HsAk7z3T67n3Dzj8ams
sHsCuk/5tkVbvJNYvYfYIbLnt6/uAbDaqWUZtTVE0hFJlDfL8e8wtbXd2RZOrC7n
htF8MEKlSmkWxJECAwEAAaNTMFEwHQYDVR0OBBYEFKDevEFGcvVheXD1v/Oeykni
wbVnMB8GA1UdIwQYMBaAFKDevEFGcvVheXD1v/OeykniwbVnMA8GA1UdEwEB/wQF
MAMBAf8wDQYJKoZIhvcNAQELBQADggEBAI+u/9FLozLaOo3P7J8PGDoZGBhoocxm
OZu6IbQXSaTpu8uRKxj8n/Xxown/qiSHMjsajf+qDXEMg9StDtttwBbpxuqx10ZQ
Us3gNP2TNh8rvNG3QZTcWVVd8lSpzJZ4T12pnPvxDN5BibjeF1/tzvzYLB/rcj1V
zv1BEnrw2BtojH4CWo4KzlIhXDoQd/Tacv38GMIyjNmtZT7+vUg8GMQquBEnsAaH
04Xmjqj/ldNh7wmBj+rxvIxqStKNS34Jx0YFXeyOQLAkp4jWkgGcJezN1SPAFM3q
n0kpVOsadP3J5/0CUB5X7SDK5X1kJA9gtaXXgvDQFqZalcKWMOZ0MtE=
-----END CERTIFICATE-----`;
const CHAVE_TESTE = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDbd50fP7n8TzB1
j3QKQlfB+VsWcSjBo272ywn3ySm8jU7yVFHp/PLBMUmxflzAzF2w0Qee1cKtdaqo
5smWqAQiriYQ0tNjzDDMVJl7w4KqVhbGv3GS0GhvkIeFl9+muz6wiPZ7I9ZnzWb1
eLjA8ZDTUznMfdrDZ7RQ/k4VMLxQj+uOcehaAxjIYLsha5q6TWQx1xhjBVWaQooc
XEY+AFctk0VNpWQuEqe/5VcKN1DAsitRo0ApH+h7AJO890+u59w84/GprLB7ArpP
+bZFW7yTWL2H2CGy57ev7gGw2qllGbU1RNIRSZQ3y/HvMLW13dkWTqwu54bRfDBC
pUppFsSRAgMBAAECggEABtYugnxxxTRMHWfOWz2oh7E5nyGZZCzWUyEaKqPTpV0r
V8OvxVyWme7Fenfyy9buvTt88G79KhOkcRYDzIObFPlJU/rvtsGaRic4ti3Ubaar
l3d7wksBOEAV/kY8o2N2WlMt7UIwyea2/bZL+EceKWMdX0T1ZWLSSTdrncZF1RmT
1tu78bSdCbBQXD/wgC1VVuEJH+tMqDuAVsTVZDX3hLH3dM845yvWACKrS0uI8Y4n
774iifpknir58aghbVnpI9mQNXg7jHR3mTaoLsTCF4FrYg2viN6J6gd17+Ewf+Ni
NHJSZS+DNiqOvMzu0fppx+GOQcD5/lY0gc4WxYy9tQKBgQD8GRmS7EBGL54QUl6Y
Knv7OEb5gOLyjDO1FNG7CNi64dMyPW8z46mKTQ0EnVFEt3SSwIVEDjsnRJ5UUgKL
ntwvxo84otQ2DSRRCGQ5zY4X9AVXfV1xVfQ50KD8zwg/Rodk2K30ZhDpBGYj1bc2
y6qQqs2r5D7pNi8fRwuut79fbQKBgQDe3TghyUEldRkO5BrKdUFN3Og3ZCQIVxlz
ToFwVhHh2D0GKCvKtYSfuzOhf2WhqjD52svnUB0J69slUAyv3SSfQb8E2VJylL0+
bac0eb3l/ss1Z1Tz60JHhhxQS7vCHjwuVpeTTWzLt+TRLubrRgKigrj0MJjvc0M6
2dTpDN8vNQKBgBbrGT4YKEe5MH9/XYYr5pWSKjGom/k88b52pBKC3WEwAolAuIlZ
GyKtmo9e1fKPUxO8WOE1Af+x50r3IbAbwxy8ymx1sSEw1KphPutaWp6m2o13ojUZ
gVh4NQqGr9NA0DJE2JutY8ArXDXJyhw7K8h3HrePyoBdIq+PP+qkXcuJAoGARH6c
99VQzmBU2TzF9x9eeL3CKPQAFwgd7FBee9YYHN9GshO6kcyD/EuerK3o4GzcLI5Q
SMFYi2oPqkIWBB7lWITuXmEkc86+8ubkkr4v3PYYIkul0mmlrzHKlesQw7JjMKKw
ZzdOjrXv/1J46ipUOPoQOgyNlFpKeVXll9K67VkCgYBqWqttlK5bC9pe6A8TXmWH
fBI82T6DZ8VeVjjseDvxDlbT6wseeg8VMPA2Z+5a9pIks9A7zcrxeYccMI5DJA9V
HGj0c0U+WVpXBbGLlaWrZpZKx7gDDlXqILQ0rpfJzWFqz2iocPPp7UgHJHtqIhM4
sk4wBCAi7RnFlFXUPmtYGg==
-----END PRIVATE KEY-----`;

const HOSTS = [
  "adn.producaorestrita.nfse.gov.br",
  "adn.nfse.gov.br",
  "sefin.producaorestrita.nfse.gov.br",
  "sefin.nfse.gov.br",
  "www.gov.br", // controle: HTTPS geral, não prova acesso aos servidores fiscais
];

const URLS: Record<string, string> = {
  adn_param_api_homolog: "https://adn.producaorestrita.nfse.gov.br/parametrizacao/4212254/convenio",
  adn_param_docs_homolog: "https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html",
  adn_param_api_producao: "https://adn.nfse.gov.br/parametrizacao/4212254/convenio",
  sefin_api_homolog: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse/00000000000000000000000000000000000000000000000000",
  sefin_docs_homolog: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index",
  controle_govbr: "https://www.gov.br/nfse/pt-br",
};

const TIMEOUT_MS = 8000;
const LIMITE_BYTES = 2048;

function msg(e: unknown) {
  const err = e as { name?: string; message?: string; cause?: unknown };
  return [err?.name, err?.message, err?.cause ? String(err.cause) : ""].filter(Boolean).join(" | ").slice(0, 400);
}

function classificar(texto: string) {
  const t = texto.toLowerCase();
  if (t.includes("tempo esgotado") || t.includes("timeout") || t.includes("timed out")) return "tempo esgotado (etapa indeterminada)";
  if (t.includes("dns") || t.includes("lookup") || t.includes("name or service")) return "DNS";
  if (t.includes("connection refused") || t.includes("network is unreachable") || t.includes("tcp connect")) return "conexão TCP";
  if (t.includes("connection reset")) return "conexão encerrada pelo servidor (provavelmente na negociação TLS)";
  if (t.includes("decrypt") || t.includes("tls") || t.includes("certificate") || t.includes("handshake") || t.includes("alert")) return "TLS";
  if (t.includes("http2") || t.includes("http/1.1")) return "protocolo HTTP";
  return "indeterminada";
}

function comTempo<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let id: number | undefined;
  const limite = new Promise<never>((_, rej) => { id = setTimeout(() => rej(new Error("tempo esgotado")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(id));
}

async function etapa<T>(fn: () => Promise<T>) {
  const inicio = Date.now();
  try {
    const r = await comTempo(fn());
    return { ok: true, ms: Date.now() - inicio, ...(r as object) };
  } catch (e) {
    const m = msg(e);
    return { ok: false, ms: Date.now() - inicio, etapa_falha: classificar(m), erro: m };
  }
}

async function diagnosticarHost(host: string) {
  // deno-lint-ignore no-explicit-any
  const D = Deno as any;
  const dns = await etapa(async () => ({ ips: (await Deno.resolveDns(host, "A")).slice(0, 3) }));
  const tcp = await etapa(async () => {
    const c = await Deno.connect({ hostname: host, port: 443 });
    c.close();
    return {};
  });
  const tlsHandshake = async (comCert: boolean) => {
    // deno-lint-ignore no-explicit-any
    let conn: any = null;
    try {
      conn = await D.connectTls({
        hostname: host,
        port: 443,
        alpnProtocols: ["http/1.1"],
        ...(comCert ? { cert: CERT_TESTE, key: CHAVE_TESTE } : {}),
      });
      const info = await conn.handshake();
      return { alpn: info?.alpnProtocol ?? null };
    } finally {
      try { conn?.close(); } catch { /* ignora */ }
    }
  };
  const tls_sem_certificado = await etapa(() => tlsHandshake(false));
  const tls_com_certificado_teste = await etapa(() => tlsHandshake(true));
  return { dns, tcp, tls_sem_certificado, tls_com_certificado_teste };
}

async function lerLimitado(r: Response) {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < LIMITE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      partes.push(value);
      total += value.length;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignora */ }
  }
  const junto = new Uint8Array(Math.min(total, LIMITE_BYTES));
  let pos = 0;
  for (const p of partes) {
    const fatia = p.subarray(0, Math.max(0, junto.length - pos));
    junto.set(fatia, pos);
    pos += fatia.length;
    if (pos >= junto.length) break;
  }
  return new TextDecoder().decode(junto).replace(/\s+/g, " ").slice(0, 400);
}

async function requisitar(url: string, client: unknown) {
  return await etapa(async () => {
    // deno-lint-ignore no-explicit-any
    const r = await fetch(url, { redirect: "manual", client } as any);
    const destino = r.headers.get("location");
    const corpo = await lerLimitado(r);
    return { status: r.status, url_final: r.url || url, redirecionamento: destino, corpo };
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Método não permitido", { status: 405 });

  // deno-lint-ignore no-explicit-any
  const D = Deno as any;
  const out: Record<string, unknown> = {
    versao: "v4",
    deno: Deno.version.deno,
    regiao: Deno.env.get("SB_REGION") ?? "desconhecida",
    observacao: "IP de saída e controle gov.br são apenas indicativos; não provam autenticação ICP-Brasil.",
  };

  out.ip_saida = await etapa(async () => {
    const r = await fetch("https://api.ipify.org?format=json");
    return { ip: (await r.json()).ip };
  });

  const hosts: Record<string, unknown> = {};
  for (const h of HOSTS) hosts[h] = await diagnosticarHost(h);
  out.etapas_por_servidor = hosts;

  // deno-lint-ignore no-explicit-any
  let semCert: any = null;
  // deno-lint-ignore no-explicit-any
  let comCert: any = null;
  try {
    semCert = D.createHttpClient({ http1: true, http2: false });
    comCert = D.createHttpClient({ cert: CERT_TESTE, key: CHAVE_TESTE, http1: true, http2: false });
    const reqs: Record<string, unknown> = {};
    for (const [nome, url] of Object.entries(URLS)) {
      reqs[nome] = {
        http1_sem_certificado: await requisitar(url, semCert),
        http1_com_certificado_teste: await requisitar(url, comCert),
      };
    }
    out.requisicoes_http = reqs;
  } catch (e) {
    out.erro_clientes = msg(e);
  } finally {
    try { semCert?.close(); } catch { /* ignora */ }
    try { comCert?.close(); } catch { /* ignora */ }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
