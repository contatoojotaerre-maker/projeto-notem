---
titulo: Assinatura
ordem: 3
atualizado: 2026-11-17
descricao: Como validar a assinatura HMAC-SHA256 do cabeçalho Notem-Assinatura, com exemplo em JavaScript.
---

# Assinatura

Há duas formas, que podem ser usadas juntas:

- **Assinatura (recomendada):** sempre enviada em `Notem-Assinatura`. Prova a origem e que o corpo não foi alterado. Passos abaixo.
- **Chave de autorização (opção simples):** se cadastrada, chega no cabeçalho escolhido (ex.: `Authorization: Bearer minha-chave`). Basta comparar com o valor que você cadastrou. Não protege contra alteração do corpo; prefira a assinatura sempre que possível.
- **Confirmar pela API:** em caso de dúvida, trate o webhook apenas como aviso e consulte o estado atual pela API (`https://app.notemfiscal.com.br/api/v1`) com a sua chave de integração antes de agir.

## Validação da assinatura
1. Leia `t` e `v1` do cabeçalho `Notem-Assinatura`.
2. Monte o texto `{t}.{corpo_bruto}` — o corpo **exatamente como recebido**, antes de converter o JSON.
3. Calcule HMAC-SHA256 desse texto com o segredo `whsec_...`, em hexadecimal minúsculo.
4. Compare com `v1` usando comparação de tempo constante.
5. Recuse se `t` tiver mais de **5 minutos** de diferença do horário atual (proteção contra reenvio malicioso).

Durante a troca de segredo, a notem pode enviar duas assinaturas (`v1=...,v1=...`); aceite se qualquer uma for válida.

## Exemplo em JavaScript (Node.js)
```javascript JavaScript
import crypto from "node:crypto";

// corpoBruto: o corpo exatamente como recebido (texto), antes de JSON.parse.
export function assinaturaValida(cabecalho, corpoBruto, segredo, agora = Date.now()) {
  const partes = cabecalho.split(",").map((p) => p.trim().split("="));
  const t = partes.find(([k]) => k === "t")?.[1];
  const assinaturas = partes.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || assinaturas.length === 0) return false;
  if (Math.abs(agora / 1000 - Number(t)) > 5 * 60) return false;
  const esperada = crypto.createHmac("sha256", segredo).update(`${t}.${corpoBruto}`).digest("hex");
  return assinaturas.some((v) =>
    v.length === esperada.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(esperada)),
  );
}
```

> [!IMPORTANTE]
> Calcule a assinatura sobre o **corpo bruto**. Converter o JSON e serializá-lo de novo muda espaços e a ordem dos campos, e a assinatura deixa de conferir.
