"""notem-transmissor v5.

Serviço isolado da notem. Responsabilidades (e somente estas):
  1. Validar um certificado A1 recebido e devolvê-lo TRANCADO (envelope AES-256-GCM).
  2. Usar um envelope recebido para conversar com o governo via TLS mútuo (mTLS).

Regras de segurança:
  - Não acessa banco de dados. Quem guarda o envelope é a notem (Supabase).
  - A chave de criptografia existe só aqui (Secret Manager -> variável CERT_KEY_V<n>).
  - Certificado e senha só existem em memória durante a requisição; nada é gravado em log.
  - Acesso protegido pelo Google (Cloud Run sem acesso público; somente a conta de serviço do painel).
  - Validação normal do certificado do servidor do governo (nenhuma verificação desativada).
"""
import base64
import binascii
import copy
import datetime as dt
import json
import os
import re
import secrets
import tempfile
import time

import gzip

import requests
from lxml import etree
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    pkcs12,
)
from flask import Flask, jsonify, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024  # 1 MB por requisição

OID_CNPJ = x509.ObjectIdentifier("2.16.76.1.3.3")
OID_RESPONSAVEL = x509.ObjectIdentifier("2.16.76.1.3.2")
UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
# Chave de acesso NFS-e (50 posições; pode conter letras quando o emitente tiver CNPJ alfanumérico)
CHAVE_RE = re.compile(r"[0-9A-Z]{50}")

BASES_ADN_PARAMETRIZACAO = {
    "homologacao": "https://adn.producaorestrita.nfse.gov.br/parametrizacao",
    "producao": "https://adn.nfse.gov.br/parametrizacao",
}


# ---------------------------------------------------------------- utilidades
class ErroNegocio(Exception):
    def __init__(self, codigo: str, mensagem: str, http: int = 422):
        super().__init__(mensagem)
        self.codigo, self.mensagem, self.http = codigo, mensagem, http


def log(evento: str, **campos):
    """Log estruturado. NUNCA receber certificado, senha, chave ou envelope aqui."""
    print(json.dumps({"evento": evento, **campos}, ensure_ascii=False), flush=True)


def chaves() -> dict:
    encontradas = {}
    for nome, valor in os.environ.items():
        m = re.fullmatch(r"CERT_KEY_V(\d+)", nome)
        if m:
            bruto = base64.b64decode(valor.strip())
            if len(bruto) != 32:
                raise RuntimeError(f"{nome} não tem 32 bytes")
            encontradas[f"v{m.group(1)}"] = bruto
    if not encontradas:
        raise RuntimeError("Nenhuma chave de criptografia configurada")
    return encontradas


def versao_atual() -> str:
    return max(chaves(), key=lambda v: int(v[1:]))


def aad(organizacao_id: str, empresa_id: str, versao: str) -> bytes:
    return f"notem:certificado:{versao}:{organizacao_id}:{empresa_id}".encode()


def exigir(corpo: dict, campo: str, padrao=None, maximo: int = 200) -> str:
    valor = corpo.get(campo)
    if not isinstance(valor, str) or not valor or len(valor) > maximo:
        raise ErroNegocio("REQUISICAO_INVALIDA", f"Campo '{campo}' ausente ou inválido.", 400)
    if padrao and not padrao.fullmatch(valor):
        raise ErroNegocio("REQUISICAO_INVALIDA", f"Campo '{campo}' em formato inválido.", 400)
    return valor


def digitos_der(dados: bytes) -> str:
    """Extrai dígitos do valor DER de um OtherName (pode vir aninhado)."""
    texto = re.sub(r"\D", "", dados.decode("latin-1", "ignore"))
    return texto


# CNPJ numérico ou alfanumérico (Receita Federal, a partir de jul/2026): 12 posições [0-9A-Z] + 2 DV numéricos.
CNPJ_RE = re.compile(r"[0-9A-Z]{12}[0-9]{2}")


def cnpj_valido(cnpj: str) -> bool:
    """DV do CNPJ (numérico e alfanumérico): valor de cada caractere = código ASCII - 48; módulo 11."""
    if not CNPJ_RE.fullmatch(cnpj or "") or len(set(cnpj)) == 1:
        return False
    def dv(base: str) -> int:
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-len(base):]
        r = sum((ord(c) - 48) * p for c, p in zip(base, pesos)) % 11
        return 0 if r < 2 else 11 - r
    return dv(cnpj[:12]) == int(cnpj[12]) and dv(cnpj[:13]) == int(cnpj[13])


def _primeiro_cnpj(texto: str):
    for i in range(0, max(len(texto) - 13, 0)):
        cand = texto[i:i + 14]
        if cnpj_valido(cand):
            return cand
    return None


def extrair_cnpj(cert: x509.Certificate):
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        for nome in san:
            if isinstance(nome, x509.OtherName) and nome.type_id == OID_CNPJ:
                bruto = nome.value.decode("latin-1", "ignore")
                achado = _primeiro_cnpj(re.sub(r"[^0-9A-Z]", " ", bruto).replace(" ", "") ) or _primeiro_cnpj(bruto)
                if not achado:  # compatibilidade com a extração anterior (somente dígitos)
                    m = re.search(r"\d{14}", digitos_der(nome.value))
                    achado = m.group(0) if m else None
                if achado:
                    return achado, "san_icp_brasil"
    except x509.ExtensionNotFound:
        pass
    cn = ",".join(a.value for a in cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME))
    m = re.search(r":([0-9A-Z]{12}[0-9]{2})", cn)
    if m:
        return m.group(1), "nome_comum"
    return None, None


def abrir_pfx(pfx: bytes, senha: str):
    try:
        chave, cert, cadeia = pkcs12.load_key_and_certificates(pfx, senha.encode("utf-8"))
    except ValueError:
        raise ErroNegocio("SENHA_OU_ARQUIVO_INVALIDO", "Senha incorreta ou arquivo de certificado inválido.")
    if cert is None:
        raise ErroNegocio("ARQUIVO_INVALIDO", "O arquivo não contém um certificado.")
    if chave is None:
        raise ErroNegocio("SEM_CHAVE_PRIVADA", "O arquivo não contém a chave privada (não é um A1 válido).")
    return chave, cert, cadeia or []


def metadados(cert: x509.Certificate, cnpj: str, fonte: str) -> dict:
    cn = ", ".join(a.value for a in cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME))
    emissor = ", ".join(a.value for a in cert.issuer.get_attributes_for_oid(x509.NameOID.COMMON_NAME))
    return {
        "titular": cn,
        "cnpj": cnpj,
        "cnpj_fonte": fonte,
        "emissor": emissor,
        "numero_serie": format(cert.serial_number, "X"),
        "valido_de": cert.not_valid_before_utc.isoformat(),
        "valido_ate": cert.not_valid_after_utc.isoformat(),
    }


def abrir_envelope(corpo: dict):
    organizacao_id = exigir(corpo, "organizacao_id", UUID_RE)
    empresa_id = exigir(corpo, "empresa_id", UUID_RE)
    env = corpo.get("envelope")
    if not isinstance(env, dict):
        raise ErroNegocio("REQUISICAO_INVALIDA", "Envelope ausente.", 400)
    versao = env.get("versao_chave")
    todas = chaves()
    if versao not in todas:
        raise ErroNegocio("ENVELOPE_INVALIDO", "Versão de chave desconhecida.")
    try:
        conteudo = AESGCM(todas[versao]).decrypt(
            base64.b64decode(env["nonce"]),
            base64.b64decode(env["dados"]),
            aad(organizacao_id, empresa_id, versao),
        )
    except Exception:  # noqa: BLE001 — qualquer falha de abertura é envelope inválido
        raise ErroNegocio("ENVELOPE_INVALIDO", "Não foi possível abrir o certificado guardado.")
    material = json.loads(conteudo)
    pfx = base64.b64decode(material["pfx"])
    return organizacao_id, empresa_id, abrir_pfx(pfx, material["senha"])


def requisicao_mtls(metodo: str, url: str, chave, cert, cadeia, corpo_json=None, timeout: float = 30) -> dict:
    """Chamada HTTPS com o certificado da empresa (mTLS). PEMs temporários só em memória (/tmp no Cloud Run), apagados em seguida."""
    pem_cert = cert.public_bytes(Encoding.PEM) + b"".join(c.public_bytes(Encoding.PEM) for c in cadeia)
    pem_chave = chave.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    caminhos = []
    inicio = time.monotonic()
    try:
        for conteudo in (pem_cert, pem_chave):
            fd, caminho = tempfile.mkstemp(prefix="notem-", suffix=".pem")
            os.chmod(caminho, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(conteudo)
            caminhos.append(caminho)
        with requests.request(
            metodo,
            url,
            cert=(caminhos[0], caminhos[1]),
            json=corpo_json,
            timeout=timeout,
            allow_redirects=False,
            stream=True,
            headers={"Accept": "application/json", "User-Agent": "notem-transmissor/2"},
        ) as r:
            corpo = r.raw.read(5 * 1024 * 1024, decode_content=True).decode("utf-8", "replace")
            return {
                "status": r.status_code,
                "tipo_conteudo": r.headers.get("Content-Type"),
                "corpo": corpo,
                "ms": round((time.monotonic() - inicio) * 1000),
            }
    except requests.exceptions.SSLError as e:
        return {"erro": "TLS", "detalhe": repr(e)[:500], "ms": round((time.monotonic() - inicio) * 1000)}
    except requests.exceptions.Timeout:
        return {"erro": "TEMPO_ESGOTADO", "ms": round((time.monotonic() - inicio) * 1000)}
    except requests.exceptions.ConnectionError as e:
        return {"erro": "CONEXAO", "detalhe": repr(e)[:500], "ms": round((time.monotonic() - inicio) * 1000)}
    finally:
        for caminho in caminhos:
            try:
                with open(caminho, "r+b") as f:
                    f.write(b"\0" * os.path.getsize(caminho))
                os.remove(caminho)
            except OSError:
                pass


def get_mtls(url: str, chave, cert, cadeia) -> dict:
    r = requisicao_mtls("GET", url, chave, cert, cadeia)
    if "corpo" in r:
        r["corpo"] = r["corpo"][: 64 * 1024]
    return r


@app.errorhandler(ErroNegocio)
def tratar_erro(e: ErroNegocio):
    return jsonify({"ok": False, "codigo": e.codigo, "mensagem": e.mensagem}), e.http


# ---------------------------------------------------------------- rotas
@app.get("/")
def raiz():
    return jsonify({"servico": "notem-transmissor", "versao": "5", "status": "ok"})


@app.post("/v1/certificados/preparar")
def preparar_certificado():
    """Valida o A1 e devolve metadados + envelope trancado. Nada é guardado aqui."""
    corpo = request.get_json(silent=True) or {}
    organizacao_id = exigir(corpo, "organizacao_id", UUID_RE)
    empresa_id = exigir(corpo, "empresa_id", UUID_RE)
    cnpj_esperado = exigir(corpo, "cnpj_esperado", CNPJ_RE)
    senha = exigir(corpo, "senha", maximo=200)
    try:
        pfx = base64.b64decode(exigir(corpo, "pfx_base64", maximo=200_000), validate=True)
    except binascii.Error:
        raise ErroNegocio("ARQUIVO_INVALIDO", "Arquivo de certificado em formato inválido.", 400)

    _, cert, _ = abrir_pfx(pfx, senha)
    agora = dt.datetime.now(dt.timezone.utc)
    if cert.not_valid_before_utc > agora:
        raise ErroNegocio("CERTIFICADO_AINDA_NAO_VALIDO", "A validade deste certificado ainda não começou.")
    if cert.not_valid_after_utc < agora:
        raise ErroNegocio("CERTIFICADO_VENCIDO", "Este certificado está vencido.")
    cnpj, fonte = extrair_cnpj(cert)
    if not cnpj:
        raise ErroNegocio("CNPJ_NAO_ENCONTRADO", "Não foi possível identificar o CNPJ no certificado (e-CNPJ ICP-Brasil).")
    if cnpj != cnpj_esperado:
        raise ErroNegocio("CNPJ_DIVERGENTE", "O CNPJ do certificado é diferente do CNPJ da empresa.")

    versao = versao_atual()
    nonce = secrets.token_bytes(12)
    material = json.dumps({"pfx": base64.b64encode(pfx).decode(), "senha": senha}).encode()
    dados = AESGCM(chaves()[versao]).encrypt(nonce, material, aad(organizacao_id, empresa_id, versao))

    log("certificado_preparado", empresa_id=empresa_id, organizacao_id=organizacao_id, versao_chave=versao)
    return jsonify({
        "ok": True,
        "metadados": metadados(cert, cnpj, fonte),
        "envelope": {
            "versao_chave": versao,
            "nonce": base64.b64encode(nonce).decode(),
            "dados": base64.b64encode(dados).decode(),
        },
    })


@app.post("/v1/municipios/convenio")
def consultar_convenio():
    """Consulta o convênio do município no ADN usando o certificado da empresa."""
    corpo = request.get_json(silent=True) or {}
    ibge = exigir(corpo, "codigo_municipio", re.compile(r"\d{7}"))
    ambiente = exigir(corpo, "ambiente", re.compile(r"homologacao|producao"))
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    url = f"{BASES_ADN_PARAMETRIZACAO[ambiente]}/{ibge}/convenio"
    resposta = get_mtls(url, chave, cert, cadeia)
    log("convenio_consultado", empresa_id=empresa_id, ambiente=ambiente,
        status=resposta.get("status"), erro=resposta.get("erro"), ms=resposta.get("ms"))
    return jsonify({"ok": True, "url": url, "ambiente": ambiente, "resposta": resposta})


# ---------------------------------------------------------------- NFS-e (Sefin Nacional)
BASES_SEFIN = {
    "homologacao": "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
    "producao": "https://sefin.nfse.gov.br/SefinNacional",
}
NS_DSIG = "http://www.w3.org/2000/09/xmldsig#"
ALGORITMOS = {
    "rsa-sha256": ("http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", "http://www.w3.org/2001/04/xmlenc#sha256", hashes.SHA256),
    "rsa-sha1": ("http://www.w3.org/2000/09/xmldsig#rsa-sha1", "http://www.w3.org/2000/09/xmldsig#sha1", hashes.SHA1),
}
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
ID_DPS_RE = re.compile(r"^DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}$")


def c14n(elemento) -> bytes:
    """C14N 1.0 inclusiva de um elemento, serializado de forma isolada.
    Evita a falha do libxml2 que insere xmlns="" em descendentes ao canonicalizar subárvores com namespace padrão."""
    isolado = etree.fromstring(etree.tostring(copy.deepcopy(elemento)))
    return etree.tostring(isolado, method="c14n", exclusive=False, with_comments=False)


def _digest(dados: bytes, alg) -> str:
    h = hashes.Hash(alg())
    h.update(dados)
    return base64.b64encode(h.finalize()).decode()


def assinar_xml(xml: bytes, chave, cert, raiz_esperada: str, filho_assinado: str, algoritmo: str = "rsa-sha256") -> bytes:
    """Assinatura XMLDSig envelopada do elemento `filho_assinado` (Reference URI=#Id), inserida como último filho da raiz."""
    if algoritmo not in ALGORITMOS:
        raise ErroNegocio("REQUISICAO_INVALIDA", "Algoritmo de assinatura não suportado.", 400)
    uri_assin, uri_digest, alg = ALGORITMOS[algoritmo]
    erro_codigo = "DPS_INVALIDA" if raiz_esperada == "DPS" else "EVENTO_INVALIDO"
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False, no_network=True)
    try:
        raiz = etree.fromstring(xml, parser)
    except etree.XMLSyntaxError:
        raise ErroNegocio(erro_codigo, "O XML não é válido.", 422)
    if etree.QName(raiz).localname != raiz_esperada:
        raise ErroNegocio(erro_codigo, f"O elemento raiz deve ser {raiz_esperada}.", 422)
    inf = next((e for e in raiz if isinstance(e.tag, str) and etree.QName(e).localname == filho_assinado), None)
    if inf is None or not inf.get("Id"):
        raise ErroNegocio(erro_codigo, f"{filho_assinado} com atributo Id não encontrado.", 422)
    if any(etree.QName(e).localname == "Signature" for e in raiz if isinstance(e.tag, str)):
        raise ErroNegocio(erro_codigo, "O XML já contém assinatura.", 422)
    ident = inf.get("Id")

    digest = _digest(c14n(inf), alg)
    sig = etree.Element("{%s}Signature" % NS_DSIG, nsmap={None: NS_DSIG})
    si = etree.SubElement(sig, "{%s}SignedInfo" % NS_DSIG)
    etree.SubElement(si, "{%s}CanonicalizationMethod" % NS_DSIG, Algorithm=C14N)
    etree.SubElement(si, "{%s}SignatureMethod" % NS_DSIG, Algorithm=uri_assin)
    ref = etree.SubElement(si, "{%s}Reference" % NS_DSIG, URI="#" + ident)
    trs = etree.SubElement(ref, "{%s}Transforms" % NS_DSIG)
    etree.SubElement(trs, "{%s}Transform" % NS_DSIG, Algorithm=ENVELOPED)
    etree.SubElement(trs, "{%s}Transform" % NS_DSIG, Algorithm=C14N)
    etree.SubElement(ref, "{%s}DigestMethod" % NS_DSIG, Algorithm=uri_digest)
    etree.SubElement(ref, "{%s}DigestValue" % NS_DSIG).text = digest
    sv = etree.SubElement(sig, "{%s}SignatureValue" % NS_DSIG)
    ki = etree.SubElement(sig, "{%s}KeyInfo" % NS_DSIG)
    x5 = etree.SubElement(ki, "{%s}X509Data" % NS_DSIG)
    etree.SubElement(x5, "{%s}X509Certificate" % NS_DSIG).text = base64.b64encode(cert.public_bytes(Encoding.DER)).decode()
    raiz.append(sig)
    sv.text = base64.b64encode(chave.sign(c14n(si), padding.PKCS1v15(), alg())).decode()
    return b'<?xml version="1.0" encoding="UTF-8"?>' + etree.tostring(raiz, encoding="UTF-8", xml_declaration=False)


def assinar_dps(xml: bytes, chave, cert, algoritmo: str = "rsa-sha256") -> bytes:
    return assinar_xml(xml, chave, cert, "DPS", "infDPS", algoritmo)


def gzip_b64(dados: bytes) -> str:
    return base64.b64encode(gzip.compress(dados)).decode()


def gunzip_b64(texto: str) -> str:
    return gzip.decompress(base64.b64decode(texto)).decode("utf-8")


def interpretar(resposta: dict) -> dict:
    """Converte a resposta bruta da Sefin: JSON quando possível e XMLs compactados descompactados."""
    saida = {k: v for k, v in resposta.items() if k != "corpo"}
    corpo = resposta.get("corpo")
    if corpo is None:
        return saida
    try:
        dados = json.loads(corpo)
    except ValueError:
        saida["corpo_texto"] = corpo[:64 * 1024]
        return saida
    for campo in ("nfseXmlGZipB64", "eventoXmlGZipB64"):
        if isinstance(dados, dict) and dados.get(campo):
            try:
                dados[campo.replace("GZipB64", "")] = gunzip_b64(dados.pop(campo))
            except Exception:  # noqa: BLE001
                pass
    # Consulta de evento (GET /nfse/{chave}/eventos/{tipo}/{seq}): o governo devolve eventos[].arquivoXml
    # (base64 + gzip). Mantém o campo original e acrescenta "xml" já decodificado.
    if isinstance(dados, dict) and isinstance(dados.get("eventos"), list):
        for ev in dados["eventos"]:
            if isinstance(ev, dict) and isinstance(ev.get("arquivoXml"), str):
                ev["xml"] = decodificar_arquivo(ev["arquivoXml"])
    saida["corpo_json"] = dados
    return saida


def exigir_ambiente(corpo: dict) -> str:
    return exigir(corpo, "ambiente", re.compile(r"homologacao|producao"))


@app.post("/v1/nfse/emitir")
def emitir_nfse():
    """Assina a DPS recebida (montada pela notem) e envia à Sefin. Não altera o conteúdo da DPS."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    algoritmo = corpo.get("algoritmo_assinatura") or "rsa-sha256"
    dps_xml = exigir(corpo, "dps_xml", maximo=900_000).encode("utf-8")
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    assinada = assinar_dps(dps_xml, chave, cert, algoritmo)
    timeout = min(float(corpo.get("tempo_limite_segundos") or 18), 25)
    resposta = requisicao_mtls(
        "POST", BASES_SEFIN[ambiente] + "/nfse", chave, cert, cadeia,
        corpo_json={"dpsXmlGZipB64": gzip_b64(assinada)}, timeout=timeout,
    )
    log("nfse_emitir", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"),
        erro=resposta.get("erro"), ms=resposta.get("ms"))
    return jsonify({"ok": True, "ambiente": ambiente, "dps_assinada": assinada.decode("utf-8"),
                    "resposta": interpretar(resposta)})


@app.post("/v1/dps/consultar")
def consultar_dps():
    """Recupera a chave de acesso pela identificação da DPS (usado quando a emissão ficou em verificação)."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    id_dps = exigir(corpo, "id_dps", ID_DPS_RE)
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    resposta = requisicao_mtls("GET", f"{BASES_SEFIN[ambiente]}/dps/{id_dps}", chave, cert, cadeia, timeout=20)
    log("dps_consultar", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"), erro=resposta.get("erro"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar(resposta)})


@app.post("/v1/nfse/consultar")
def consultar_nfse():
    """Obtém a NFS-e (XML) pela chave de acesso."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    chave_acesso = exigir(corpo, "chave_acesso", CHAVE_RE)
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    resposta = requisicao_mtls("GET", f"{BASES_SEFIN[ambiente]}/nfse/{chave_acesso}", chave, cert, cadeia, timeout=20)
    log("nfse_consultar", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"), erro=resposta.get("erro"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar(resposta)})


TIPO_EVENTO_RE = re.compile(r"\d{6}")


@app.post("/v1/nfse/evento")
def registrar_evento():
    """Assina o pedido de registro de evento (pedRegEvento, montado pela notem) e envia a POST {Sefin}/nfse/{chave}/eventos.
    Usado para cancelamento (e101101) e solicitação de análise fiscal (e101103). Não altera o conteúdo."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    chave_acesso = exigir(corpo, "chave_acesso", CHAVE_RE)
    evento_xml = exigir(corpo, "evento_xml", maximo=200_000).encode("utf-8")
    algoritmo = corpo.get("algoritmo_assinatura") or "rsa-sha256"
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    assinado = assinar_xml(evento_xml, chave, cert, "pedRegEvento", "infPedReg", algoritmo)
    # o Id do pedido deve referenciar a mesma chave informada na rota
    raiz = etree.fromstring(assinado)
    inf = next(e for e in raiz if isinstance(e.tag, str) and etree.QName(e).localname == "infPedReg")
    if not inf.get("Id", "").startswith("PRE" + chave_acesso):
        raise ErroNegocio("EVENTO_INVALIDO", "O Id do pedido não corresponde à chave de acesso informada.", 422)
    timeout = min(float(corpo.get("tempo_limite_segundos") or 18), 25)
    resposta = requisicao_mtls(
        "POST", f"{BASES_SEFIN[ambiente]}/nfse/{chave_acesso}/eventos", chave, cert, cadeia,
        corpo_json={"pedidoRegistroEventoXmlGZipB64": gzip_b64(assinado)}, timeout=timeout,
    )
    log("nfse_evento", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"),
        erro=resposta.get("erro"), ms=resposta.get("ms"))
    return jsonify({"ok": True, "ambiente": ambiente, "evento_assinado": assinado.decode("utf-8"),
                    "resposta": interpretar(resposta)})


@app.post("/v1/nfse/evento/consultar")
def consultar_evento():
    """GET {Sefin}/nfse/{chave}/eventos/{tipoEvento}/{numSeqEvento} — confirma um evento após falha/tempo esgotado."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    chave_acesso = exigir(corpo, "chave_acesso", CHAVE_RE)
    tipo = exigir(corpo, "tipo_evento", TIPO_EVENTO_RE)
    if isinstance(corpo.get("num_seq_evento"), int):
        corpo["num_seq_evento"] = str(corpo["num_seq_evento"])
    seq = exigir(corpo, "num_seq_evento", re.compile(r"\d{1,3}"))
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    resposta = requisicao_mtls("GET", f"{BASES_SEFIN[ambiente]}/nfse/{chave_acesso}/eventos/{tipo}/{seq}", chave, cert, cadeia, timeout=20)
    log("nfse_evento_consultar", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"), erro=resposta.get("erro"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar(resposta)})


# ---------------------------------------------------------------- ADN (distribuição para contribuintes)
BASES_ADN_CONTRIB = {
    "homologacao": "https://adn.producaorestrita.nfse.gov.br/contribuintes",
    "producao": "https://adn.nfse.gov.br/contribuintes",
}


def decodificar_arquivo(texto):
    """ArquivoXml do ADN: tenta gzip+base64, depois base64 simples, por fim devolve como veio."""
    if not isinstance(texto, str) or not texto:
        return texto
    try:
        bruto = base64.b64decode(texto, validate=True)
    except (binascii.Error, ValueError):
        return texto
    try:
        return gzip.decompress(bruto).decode("utf-8")
    except OSError:
        try:
            return bruto.decode("utf-8")
        except UnicodeDecodeError:
            return texto


def interpretar_adn(resposta: dict) -> dict:
    saida = {k: v for k, v in resposta.items() if k != "corpo"}
    corpo = resposta.get("corpo")
    if corpo is None:
        return saida
    try:
        dados = json.loads(corpo)
    except ValueError:
        saida["corpo_texto"] = corpo[:64 * 1024]
        return saida
    if isinstance(dados, dict):
        for doc in dados.get("LoteDFe") or []:
            if isinstance(doc, dict) and "ArquivoXml" in doc:
                doc["Xml"] = decodificar_arquivo(doc.pop("ArquivoXml"))
    saida["corpo_json"] = dados
    return saida


@app.post("/v1/adn/dfe")
def adn_distribuicao():
    """GET {ADN}/contribuintes/DFe/{NSU}?lote=true — documentos (NFS-e e eventos) do CNPJ a partir do NSU.
    O XML de cada documento volta descompactado em LoteDFe[].Xml."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    nsu = corpo.get("nsu")
    if not isinstance(nsu, int) or nsu < 0 or nsu > 10**15:
        raise ErroNegocio("REQUISICAO_INVALIDA", "nsu deve ser um número inteiro maior ou igual a zero.", 400)
    lote = corpo.get("lote", True) is not False
    cnpj_consulta = corpo.get("cnpj_consulta")
    if cnpj_consulta is not None and not cnpj_valido(str(cnpj_consulta)):
        raise ErroNegocio("REQUISICAO_INVALIDA", "cnpj_consulta deve ser um CNPJ válido (14 posições).", 400)
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    url = f"{BASES_ADN_CONTRIB[ambiente]}/DFe/{nsu}?lote={'true' if lote else 'false'}"
    if cnpj_consulta:
        url += f"&cnpjConsulta={cnpj_consulta}"
    resposta = requisicao_mtls("GET", url, chave, cert, cadeia, timeout=30)
    log("adn_dfe", empresa_id=empresa_id, ambiente=ambiente, nsu=nsu, status=resposta.get("status"),
        erro=resposta.get("erro"), ms=resposta.get("ms"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar_adn(resposta)})


@app.post("/v1/adn/eventos")
def adn_eventos_por_chave():
    """GET {ADN}/contribuintes/NFSe/{chave}/Eventos — todos os eventos vinculados à NFS-e (XML descompactado)."""
    corpo = request.get_json(silent=True) or {}
    ambiente = exigir_ambiente(corpo)
    chave_acesso = exigir(corpo, "chave_acesso", CHAVE_RE)
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    resposta = requisicao_mtls("GET", f"{BASES_ADN_CONTRIB[ambiente]}/NFSe/{chave_acesso}/Eventos", chave, cert, cadeia, timeout=30)
    log("adn_eventos", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"), erro=resposta.get("erro"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar_adn(resposta)})
