# Histórico de alterações da API

Mudanças que afetam respostas da API `/api/v1`, da mais recente para a mais antiga.

## 16/11/2026 — Mensagens de validação e identificadores
- **Mensagens de validação em português.** As mensagens em `detalhes[].mensagem` de `400 REQUISICAO_INVALIDA` e `422 REGRA_DE_NEGOCIO` que antes saíam em inglês agora são escritas pela notem, em português. Exemplos: "Required" → "Campo obrigatório."; "Unrecognized key(s) in object: 'x'" → "Campo não aceito: x."; "Invalid enum value…" → "Valor inválido. Use: a, b ou c."; "String must contain at most 200 character(s)" → "Use no máximo 200 caracteres."; "Invalid uuid" → "Identificador inválido (UUID).". Códigos (`codigo`), status e `campo` não mudaram.
- **Campo não aceito.** A mensagem cita no máximo 5 nomes de campo, cada um com até 60 caracteres (cortado com "…"), e informa quantos faltam ("e mais N").
- **UUID no padrão RFC 9562.** Identificadores fora do padrão (por exemplo `00000000-0000-0000-0000-000000000001`, ou texto que não é UUID) são recusados com `400 REQUISICAO_INVALIDA` e o `campo` preenchido:
  - no corpo (ex.: `empresa_id`): antes, o formato frouxo passava e a resposta era `404`;
  - no caminho (`/empresas/{id}`, `/empresas/{id}/servicos/{servico_id}`, `/empresas/{id}/tomadores/{tomador_id}`, `/empresas/{id}/notas-recebidas/{nota_id}`, `/notas/{id}`): antes, `404 NAO_ENCONTRADO`;
  - na consulta (`GET /notas?empresa_id=`): já era 400; a mensagem agora é "Identificador inválido (UUID).".
  - Todo identificador emitido pela notem já segue o padrão, então nenhum registro existente é afetado. UUID válido inexistente ou de outra organização continua `404 NAO_ENCONTRADO`.
