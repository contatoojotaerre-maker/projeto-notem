# Correções fiscais antes da Parte 3

## Escopo
Corrigir as regras apontadas na conferência externa, sem iniciar a Parte 3 e sem alterar `transmissor/`. Os três XML serão entregues completos no chat para nova conferência, sem depender da sincronização com o GitHub.

## 1. Descontos na DPS — E0431/E0432
- Omitir `vDescIncond` quando o desconto incondicionado for zero e `vDescCond` quando o condicionado for zero.
- Omitir todo o grupo `vDescCondIncond` quando ambos forem zero ou ausentes.
- Manter a validação de valores não negativos e do limite de descontos em relação ao serviço.

## 2. Matriz de tributos aproximados
Aplicar a mesma matriz na configuração fiscal do painel, API, validação do banco e montagem da DPS:

| Situação no Simples | Permitido | Proibido |
|---|---|---|
| Não optante (1) | Três percentuais por esfera (`pTotTrib`) | `pTotTribSN` e `indTotTrib` — E0713 |
| MEI (2) | Três percentuais por esfera ou não informar (`indTotTrib = 0`) | `pTotTribSN` — E0710 |
| ME/EPP (3) | Percentual do Simples (`pTotTribSN`) ou três percentuais por esfera | `indTotTrib` — E0712 |

- Exibir apenas escolhas permitidas para cada situação; a mudança exige confirmação quando descartar percentuais preenchidos.
- Preservar integralmente configurações já gravadas incompatíveis, sem ajustes automáticos ao ler ou migrar.
- Mostrar aviso com a regra violada no painel e considerar a empresa com **configuração fiscal incompleta** na situação compartilhada pelo painel/API.
- Rejeitar gravações inválidas com mensagem específica da regra e campo correspondente do contrato da API.

## 3. Validação antes da numeração — E0202 e configuração fiscal
- Preparar uma validação compartilhada anterior à reserva de número, para a futura emissão usar antes de qualquer operação de numeração.
- Recusar tomador nacional com CPF/CNPJ igual ao documento do prestador, com a mensagem exata: **“O tomador não pode ser a própria empresa emitente”**.
- Recusar configurações fiscais incompatíveis com a matriz, apresentando a mensagem de E0710, E0712 ou E0713.
- Repetir essas proteções no montador da DPS. Não criar a emissão ou transmissão da Parte 3 nesta etapa.

## 4. Exemplos, documentação e testes
- Regenerar os três exemplos: Simples com tomador PJ de CNPJ diferente, não optante com tomador PF e tomador estrangeiro; incluir desconto incondicionado positivo em um deles.
- Entregar os três XML completos, cada um em seu bloco de código, no chat.
- Atualizar `docs/api/empresas.md`, `docs/api/notas.md`, `docs/api/openapi.yaml`, a explicação dos exemplos e `AGENTS.md`.
- Testar as nove combinações situação/modo, percentuais obrigatórios, configurações legadas incompletas sem alteração, descontos ausentes/zero/positivos e igualdade de documentos.
- Demonstrar em teste que a recusa ocorre antes da chamada de reserva, sem consumo de número.
- Validar os três exemplos sem erros contra o XSD, corrigindo **somente** o padrão de `TSSerieDPS` na cópia em memória. Manter o ZIP oficial intacto.
- Executar os testes fiscais, API, DPS e validações de banco com rollback; reportar separadamente qualquer verificação indisponível.

## Detalhes técnicos
- Reutilizar o schema fiscal e o cálculo único de prontidão existentes, com mensagens compartilhadas entre a configuração e o montador.
- Acrescentar migração que proteja novas gravações com a matriz sem atualizar registros legados; preservar autorização, isolamento por organização e atribuição de séries.
- A reserva definitiva existente continua sem devolução/reutilização; a checagem anterior à reserva será obrigatória no fluxo de emissão da Parte 3.

## Pausa obrigatória
Após concluir estas correções e entregar os três XML, aguardar a nova conferência e liberação expressa do proprietário. A Parte 3 permanece bloqueada.