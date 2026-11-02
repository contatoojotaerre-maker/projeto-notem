"""notem-transmissor — etapa de PROVA.

Nesta versão o serviço só faz diagnóstico de conectividade com a Sefin e o ADN,
SEM certificado de cliente, SEM DPS e SEM acesso a banco ou segredos.
Validação normal do certificado do servidor (nenhuma verificação desativada).
"""
import os
import ssl
import time

import requests
from flask import Flask, jsonify

app = Flask(__name__)

ALVOS = {
    "sefin_docs_homolog": "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index",
    "sefin_api_homolog": "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse/00000000000000000000000000000000000000000000000000",
    "adn_docs_homolog": "https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html",
    "adn_api_homolog": "https://adn.producaorestrita.nfse.gov.br/parametrizacao/4212254/convenio",
    "controle_govbr": "https://www.gov.br/nfse/pt-br",
}


def consultar(url: str) -> dict:
    inicio = time.monotonic()
    try:
        with requests.get(
            url,
            timeout=20,
            allow_redirects=False,
            stream=True,
            headers={"User-Agent": "notem-transmissor-diagnostico"},
        ) as r:
            corpo = r.raw.read(2048, decode_content=True).decode("utf-8", "replace")
            return {
                "status": r.status_code,
                "ms": round((time.monotonic() - inicio) * 1000),
                "redirecionamento": r.headers.get("Location"),
                "corpo": " ".join(corpo.split())[:300],
            }
    except Exception as e:  # noqa: BLE001 — diagnóstico: registrar qualquer falha
        return {"erro": repr(e)[:500], "ms": round((time.monotonic() - inicio) * 1000)}


@app.get("/")
def raiz():
    return jsonify({"servico": "notem-transmissor", "etapa": "prova", "status": "ok"})


@app.get("/diagnostico")
def diagnostico():
    out = {
        "openssl": ssl.OPENSSL_VERSION,
        "servico": os.environ.get("K_SERVICE", "local"),
        "revisao": os.environ.get("K_REVISION", "local"),
    }
    for nome, url in ALVOS.items():
        out[nome] = consultar(url)
    return jsonify(out)
