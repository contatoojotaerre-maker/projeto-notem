---
titulo: Histórico de mudanças
ordem: 0
atualizado: 2026-11-26
descricao: Mudanças que afetam respostas da API /api/v1, da mais recente para a mais antiga.
---

# Histórico de mudanças

Mudanças que afetam respostas da API `/api/v1`, da mais recente para a mais antiga.

## 26/11/2026 — PIS/COFINS opcional por empresa
- Configuração fiscal aceita PIS/COFINS opcional por empresa, com CST 99 e tipo de retenção 0. Essa escolha escreve o grupo nas novas DPS, sem base, alíquotas ou valores; não configura todas as empresas automaticamente.
- **Reenvie SEMPRE `pis_cofins` em cada PUT para manter a escolha.** Omissão ou `null` remove a configuração anterior. Consultas sem configuração devolvem `pis_cofins: null`; as DPS omitem `tribFed`.
- Outra combinação ou configuração parcial retorna `422 REGRA_DE_NEGOCIO`, campo `pis_cofins`, mensagem "combinação de PIS/COFINS ainda não suportada". Notas já criadas e suas tentativas posteriores preservam a configuração original.
- Referência pública explicita a correspondência dos regimes de apuração do Simples com os códigos 1/2/3 da DPS.

## 17/11/2026 — Textos de orientação e documentação pública
- **Orientações de rejeição mais claras.** A explicação em português de duas recusas do governo deixou de citar etapas internas da notem. `codigo`, `campo` e status não mudaram:
  - **E0714**: agora orienta "Confira se o certificado digital da empresa está válido e corresponde ao CNPJ antes de repetir a emissão."
  - **E0855**: agora termina com "Se a obrigatoriedade do IBS/CBS na notem ainda não começou para este ambiente, fale com o suporte da notem."
- **Especificação OpenAPI.** Grupos por assunto, `operationId`, descrições e exemplos fictícios em todas as 40 operações. Os esquemas passaram a descrever exatamente as respostas atuais (sem mudança de comportamento): empresa com campos `null`, `pendencias` na situação da empresa, itens dos catálogos, corpo parcial na alteração de serviço, `pode_solicitar_analise` nos detalhes de erro e o evento `nota.desbloqueada_prefeitura` na lista de webhooks.
- **Documentação pública** em https://docs.notemfiscal.com.br.

## 16/11/2026 — Mensagens de validação e identificadores
- **Mensagens de validação em português.** As mensagens em `detalhes[].mensagem` de `400 REQUISICAO_INVALIDA` e `422 REGRA_DE_NEGOCIO` que antes saíam em inglês agora são escritas pela notem, em português. Exemplos: "Required" → "Campo obrigatório."; "Unrecognized key(s) in object: 'x'" → "Campo não aceito: x."; "Invalid enum value…" → "Valor inválido. Use: a, b ou c."; "String must contain at most 200 character(s)" → "Use no máximo 200 caracteres."; "Invalid uuid" → "Identificador inválido (UUID).". Códigos (`codigo`), status e `campo` não mudaram.
- **Campo não aceito.** A mensagem cita no máximo 5 nomes de campo, cada um com até 60 caracteres (cortado com "…"), e informa quantos faltam ("e mais N").
- **UUID no padrão RFC 9562.** Identificadores fora do padrão (por exemplo `00000000-0000-0000-0000-000000000001`, ou texto que não é UUID) são recusados com `400 REQUISICAO_INVALIDA` e o `campo` preenchido:
  - no corpo (ex.: `empresa_id`): antes, o formato frouxo passava e a resposta era `404`;
  - no caminho (`/empresas/{id}`, `/empresas/{id}/servicos/{servico_id}`, `/empresas/{id}/tomadores/{tomador_id}`, `/empresas/{id}/notas-recebidas/{nota_id}`, `/notas/{id}`): antes, `404 NAO_ENCONTRADO`;
  - na consulta (`GET /notas?empresa_id=`): já era 400; a mensagem agora é "Identificador inválido (UUID).".
  - Todo identificador emitido pela notem já segue o padrão, então nenhum registro existente é afetado. UUID válido inexistente ou de outra organização continua `404 NAO_ENCONTRADO`.
