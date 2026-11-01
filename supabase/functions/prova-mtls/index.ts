// prova-mtls v2 — função TEMPORÁRIA de diagnóstico da notem. Apague após o teste.
// O certificado abaixo é autoassinado, descartável e sem valor (gerado só para este teste).
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

const ALVOS: Record<string, string> = {
  adn_param_api_homolog: "https://adn.producaorestrita.nfse.gov.br/parametrizacao/4212254/convenio",
  adn_param_docs_homolog: "https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html",
  adn_contrib_docs_homolog: "https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html",
  adn_param_api_producao: "https://adn.nfse.gov.br/parametrizacao/4212254/convenio",
  sefin_api_homolog: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse/00000000000000000000000000000000000000000000000000",
  sefin_docs_homolog: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/docs/index",
};

function msg(e: unknown) {
  const err = e as { name?: string; message?: string; cause?: unknown };
  return [err?.name, err?.message, err?.cause ? String(err.cause) : ""].filter(Boolean).join(" | ").slice(0, 500);
}

async function tentar(url: string, client?: unknown) {
  const inicio = Date.now();
  try {
    // deno-lint-ignore no-explicit-any
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), ...(client ? ({ client } as any) : {}) });
    const corpo = (await r.text()).replace(/\s+/g, " ").slice(0, 300);
    return { status: r.status, ms: Date.now() - inicio, corpo };
  } catch (e) {
    return { erro: msg(e), ms: Date.now() - inicio };
  }
}

Deno.serve(async () => {
  // deno-lint-ignore no-explicit-any
  const D = Deno as any;
  const out: Record<string, unknown> = { versao: "v2", deno: Deno.version.deno };

  let semCert: unknown = null;
  let comCert: unknown = null;
  try { semCert = D.createHttpClient({ http1: true, http2: false }); out.cliente_http1 = "criado"; }
  catch (e) { out.cliente_http1 = "falhou: " + msg(e); }
  try { comCert = D.createHttpClient({ cert: CERT_TESTE, key: CHAVE_TESTE, http1: true, http2: false }); out.cliente_http1_cert = "criado"; }
  catch (e) { out.cliente_http1_cert = "falhou: " + msg(e); }

  const resultados = await Promise.all(Object.entries(ALVOS).map(async ([nome, url]) => {
    const [padrao, http1, http1Cert] = await Promise.all([
      tentar(url),
      semCert ? tentar(url, semCert) : Promise.resolve("sem cliente"),
      comCert ? tentar(url, comCert) : Promise.resolve("sem cliente"),
    ]);
    return [nome, { padrao, http1, http1_com_certificado_teste: http1Cert }] as const;
  }));
  for (const [nome, r] of resultados) out[nome] = r;

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
