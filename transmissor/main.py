"""notem-transmissor v2.

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


def extrair_cnpj(cert: x509.Certificate):
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        for nome in san:
            if isinstance(nome, x509.OtherName) and nome.type_id == OID_CNPJ:
                m = re.search(r"\d{14}", digitos_der(nome.value))
                if m:
                    return m.group(0), "san_icp_brasil"
    except x509.ExtensionNotFound:
        pass
    cn = ",".join(a.value for a in cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME))
    m = re.search(r":(\d{14})", cn)
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
    return jsonify({"servico": "notem-transmissor", "versao": "2", "status": "ok"})


@app.post("/v1/certificados/preparar")
def preparar_certificado():
    """Valida o A1 e devolve metadados + envelope trancado. Nada é guardado aqui."""
    corpo = request.get_json(silent=True) or {}
    organizacao_id = exigir(corpo, "organizacao_id", UUID_RE)
    empresa_id = exigir(corpo, "empresa_id", UUID_RE)
    cnpj_esperado = exigir(corpo, "cnpj_esperado", re.compile(r"\d{14}"))
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
ID_DPS_RE = re.compile(r"^DPS\d{42}$")


def c14n(elemento) -> bytes:
    """C14N 1.0 inclusiva de um elemento, serializado de forma isolada.
    Evita a falha do libxml2 que insere xmlns="" em descendentes ao canonicalizar subárvores com namespace padrão."""
    isolado = etree.fromstring(etree.tostring(copy.deepcopy(elemento)))
    return etree.tostring(isolado, method="c14n", exclusive=False, with_comments=False)


def _digest(dados: bytes, alg) -> str:
    h = hashes.Hash(alg())
    h.update(dados)
    return base64.b64encode(h.finalize()).decode()


def assinar_dps(xml: bytes, chave, cert, algoritmo: str = "rsa-sha256") -> bytes:
    """Assinatura XMLDSig envelopada do elemento infDPS (Reference URI=#Id), inserida como último filho de DPS."""
    if algoritmo not in ALGORITMOS:
        raise ErroNegocio("REQUISICAO_INVALIDA", "Algoritmo de assinatura não suportado.", 400)
    uri_assin, uri_digest, alg = ALGORITMOS[algoritmo]
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False, no_network=True)
    try:
        raiz = etree.fromstring(xml, parser)
    except etree.XMLSyntaxError:
        raise ErroNegocio("DPS_INVALIDA", "O XML da DPS não é válido.", 422)
    if etree.QName(raiz).localname != "DPS":
        raise ErroNegocio("DPS_INVALIDA", "O elemento raiz deve ser DPS.", 422)
    inf = next((e for e in raiz if isinstance(e.tag, str) and etree.QName(e).localname == "infDPS"), None)
    if inf is None or not inf.get("Id"):
        raise ErroNegocio("DPS_INVALIDA", "infDPS com atributo Id não encontrado.", 422)
    if any(etree.QName(e).localname == "Signature" for e in raiz if isinstance(e.tag, str)):
        raise ErroNegocio("DPS_INVALIDA", "A DPS já contém assinatura.", 422)
    id_dps = inf.get("Id")

    digest = _digest(c14n(inf), alg)

    E = lambda tag, **attrs: etree.Element("{%s}%s" % (NS_DSIG, tag), nsmap={None: NS_DSIG} if tag == "Signature" else None, **attrs)
    sig = E("Signature")
    si = etree.SubElement(sig, "{%s}SignedInfo" % NS_DSIG)
    etree.SubElement(si, "{%s}CanonicalizationMethod" % NS_DSIG, Algorithm=C14N)
    etree.SubElement(si, "{%s}SignatureMethod" % NS_DSIG, Algorithm=uri_assin)
    ref = etree.SubElement(si, "{%s}Reference" % NS_DSIG, URI="#" + id_dps)
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

    si_c14n = c14n(si)
    sv.text = base64.b64encode(chave.sign(si_c14n, padding.PKCS1v15(), alg())).decode()
    return b'<?xml version="1.0" encoding="UTF-8"?>' + etree.tostring(raiz, encoding="UTF-8", xml_declaration=False)


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
    chave_acesso = exigir(corpo, "chave_acesso", re.compile(r"\d{50}"))
    _, empresa_id, (chave, cert, cadeia) = abrir_envelope(corpo)
    resposta = requisicao_mtls("GET", f"{BASES_SEFIN[ambiente]}/nfse/{chave_acesso}", chave, cert, cadeia, timeout=20)
    log("nfse_consultar", empresa_id=empresa_id, ambiente=ambiente, status=resposta.get("status"), erro=resposta.get("erro"))
    return jsonify({"ok": True, "ambiente": ambiente, "resposta": interpretar(resposta)})
