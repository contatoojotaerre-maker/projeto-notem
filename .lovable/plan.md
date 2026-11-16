# Atualização do zod 3 → 4 (sem mudar comportamento nem contrato)

## O que já conferi (sem alterar o projeto)
Comparei, numa cópia temporária fora do projeto, as mesmas validações com o zod 3.25.76 (atual) e o 4.6.7.

- **Versão:** `zod@4.6.7` é a última estável, publicada em 12/10/2026 (35 dias). As ferramentas do TanStack já usam o zod 4 internamente e o `@hookform/resolvers` 5.2.2 aceita 3 ou 4. **Nenhuma outra dependência precisa mudar.**
- **Mensagens em inglês hoje (o ponto principal):** em 40 casos típicos, **todas** as mensagens padrão do zod chegam ao parceiro em inglês, e mudam de texto na v4. Exemplos:
  - campo ausente: "Required" → v4 "Invalid input: expected string, received undefined";
  - campo desconhecido: "Unrecognized key(s) in object: 'x'" → v4 `Unrecognized key: "x"`;
  - opção inválida: "Invalid enum value. Expected 'pj' | 'pf' | 'estrangeiro', received 'z'";
  - texto longo: "String must contain at most 2000 character(s)";
  - UUID: "Invalid uuid"; formato (ex.: `competencia`): "Invalid"; tipo errado: "Expected string, received number".
  - No painel também aparecem: nome do serviço vazio e descrição do webhook longa mostram texto em inglês.
  - As mensagens que a notem já escreve (CNPJ inválido, E0712, "nunca ambos" etc.) ficam iguais nas duas versões.
- **Quais erros aparecem e em que ordem:** iguais nas duas versões em todos os casos testados, inclusive em combinações (campo desconhecido junto com uma regra da notem).
- **UUIDs:**
  - No banco, todos os identificadores de todas as tabelas, inclusive os usuários, já seguem a regra rígida (0 fora do padrão).
  - Nos testes, só `src/test/webhooks.test.ts` usa `00000000-0000-0000-0000-000000000001/…02`, em 2 linhas. Os demais já são válidos.
  - Na documentação, o exemplo de webhook do `openapi.yaml` usa esses mesmos dois.
  - **Única mudança de resultado esperada:** um UUID fora do padrão (ex.: `00000000-0000-0000-0000-000000000001`) hoje passa na API e cai em 404. Com a regra rígida, passa a ser recusado com 400 antes de consultar. Como nenhum ID real fica fora do padrão, isso não afeta nenhum registro existente.
- **E-mail:** comparei as duas regras em 3 milhões de combinações aleatórias e em casos reais (com `+`, subdomínio, `.com.br`, `.gov.br`, apóstrofo e maiúsculas): **0 divergências**. Hoje há só 2 e-mails gravados (1 empresa e 1 usuário), e os dois passam nas duas versões.
- **Data e hora (`.datetime()`, só nos filtros de logs do painel):** fuso `-03:00` é recusado nas duas versões, como hoje. **Diferença:** a v4 recusa hora sem segundos (`2026-11-15T10:00Z`), que hoje é aceita. O painel sempre envia com segundos, mas manterei o critério atual exatamente.
- **`.default()` (26 usos):** todos os padrões são valores fixos que já passam na própria validação (`''`, `false`, `true`, `0`, `null`, `[]`, `'all'`). Não há `.default()` dentro de campo opcional nem de `.partial()`, então o resultado é o mesmo. Não precisa de `.prefault()`.
- **`z.record`:** o único uso já tem chave e valor.
- **`superRefine`:** os 4 usos só acrescentam erros com caminho fixo e não usam `ctx.path`. Funcionam iguais na v4.
- **Códigos de erro e `error.errors`:** nenhum código da notem depende dos nomes do zod e não há uso de `error.errors`. Tudo lê `error.issues`, mensagem e caminho.
- **Números:** valores fiscais são texto decimal. A v4 recusa `Infinity` e inteiros acima do limite seguro. Isso só seria alcançável por chamadas forjadas do painel (JSON não transmite `Infinity`), e esses valores já eram recusados por limites ou pelo banco.

## Como vou fazer (em 3 passos, para provar que nada mudou)
1. **Retrato "antes" (zod 3, sem mudar código):** um teste novo registra as respostas de erro de todas as validações da API (empresas, endereço, configuração fiscal, serviços, certificado, notas, tomadores, cancelamento/substituição) e dos formulários do painel (empresa, organização, configuração fiscal, serviço, webhook, integração). Ele cobre a mensagem exibida, para entradas inválidas típicas: campo ausente, tipo errado, UUID inválido, e-mail inválido, opção inválida, campo desconhecido, texto longo, formato, lista vazia e números fora do limite. O retrato fica guardado.
2. **Mensagens em português controladas pela notem (ainda no zod 3):** um único módulo da notem passa a definir o texto de todo erro sem mensagem própria. Todos os arquivos passam a importar o zod por ele. As mensagens que já escrevemos não mudam. Gero o retrato de novo e entrego a diferença 1 → 2: é a lista do que estava em inglês e como ficou. Proposta de textos:

| Situação | Hoje | Novo |
|---|---|---|
| Campo ausente | Required | Campo obrigatório. |
| Tipo errado | Expected string/number/boolean/object/array… | Informe um texto. / Informe um número. / Informe true ou false. / Informe um objeto JSON. / Informe uma lista. |
| Inteiro | Expected integer, received float | Informe um número inteiro. |
| Campo desconhecido | Unrecognized key(s) in object: 'x' | Campo não aceito: x. (vários: "Campos não aceitos: x, y.") |
| Opção inválida | Invalid enum value. Expected … | Valor inválido. Use: pj, pf ou estrangeiro. |
| Texto curto | String must contain at least 1 character(s) | Informe um valor. (N>1: "Use pelo menos N caracteres.") |
| Texto longo | String must contain at most N character(s) | Use no máximo N caracteres. |
| Número fora do limite | Number must be … | Informe um valor maior/menor ou igual a N. |
| Lista | Array must contain … | Informe pelo menos/no máximo N item(ns). |
| UUID | Invalid uuid | Identificador inválido (UUID). |
| E-mail sem texto próprio | Invalid email | E-mail inválido. |
| Formato | Invalid | Formato inválido. |
| Data e hora | Invalid datetime | Data e hora inválidas. |
| Qualquer outro caso | Invalid input / Invalid | Valor inválido. |

Números com separador brasileiro ("1.024"). Os códigos (`REQUISICAO_INVALIDA`, `REGRA_DE_NEGOCIO`), os status e os campos (`campo`, incluindo `corpo`) não mudam.

3. **Troca para o zod 4.6.7:** adapto o módulo de mensagens ao formato da v4 e gero o retrato de novo. Ele tem de ser **idêntico ao do passo 2**, com uma única diferença esperada e já explicada: o UUID fora do padrão. Ajustes no código:
   - `.strict()` (16) → `z.strictObject`; `.passthrough()` (2) → `z.looseObject`. Campo desconhecido continua recusado com o mesmo código, campo e mensagem; o retrato confirma.
   - E-mail: fixo a regra atual como regra da notem, para não depender de mudanças futuras do zod.
   - Data e hora dos filtros de logs: regra da notem idêntica à de hoje (Z obrigatório, segundos opcionais, frações livres). Faço um teste com os 9 casos que comparei.
   - `.uuid()` continua rígido na API (sem `z.guid()`).
   - Mantenho `.uuid()`, `.email()` e `superRefine` na forma atual, que a v4 ainda aceita. Assim a mudança fica menor; uma troca só de forma pode ficar para depois.
   - Uma regra da verificação do código impede importar o zod diretamente fora do módulo da notem.

## Testes e dados de teste
- Os 563 testes atuais devem passar sem mudar o que conferem. Única alteração de dado: em `src/test/webhooks.test.ts`, os 2 UUIDs fora do padrão viram UUIDs válidos. Também troco o exemplo do `openapi.yaml` pelos mesmos valores válidos, só na documentação.
- Testes novos: o retrato (comparado com o arquivo guardado), "nenhuma mensagem do retrato contém texto padrão do zod", a lista de e-mails, os casos de data e hora e o UUID rígido.
- Rodo de novo: suíte completa, verificação de tipos, montagem do app, OpenAPI 3.1, matriz de isolamento (1.495 verificações) e os exemplos de DPS no esquema oficial do release 1.

## Documentação
- `docs/interno/validacao-mensagens.md`: regra "mensagens sempre da notem", tabela acima e lista do que mudou de inglês para português.
- Regra técnica no AGENTS.md: validação importa o zod só pelo módulo da notem.
- `docs/api/`: nenhuma página promete os textos antigos em inglês. Acrescento só uma nota de que as mensagens de `detalhes` são em português e podem ser melhoradas, enquanto `codigo` e `campo` são estáveis.

## Fora do escopo
- Regras fiscais, banco, permissões, migrações e `transmissor/`: nada muda.
- Sem publicação antes da sua aprovação.

## Pontos para você decidir
1. Os textos da tabela (posso ajustar qualquer um).
2. Aceitar a recusa (400) de UUID fora do padrão na API, que hoje cai em 404.
3. Erro de validação interna das funções do painel (só acontece se alguém burlar o formulário): hoje a tela mostra um bloco técnico. Com o passo 2 o conteúdo fica em português, mas o formato continua. Proponho não mexer agora.

## Não será possível verificar
- Telas com login real: o login deste projeto não pode ser simulado aqui. Confiro a montagem e as validações dos formulários por testes.
- Chamadas com chave real.
