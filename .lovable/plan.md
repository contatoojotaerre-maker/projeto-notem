# notem — Catálogos oficiais e busca de municípios

## A. Carga dos catálogos oficiais
- Criar uma migração com os dados literais dos dois CSV do repositório, sem corrigir, traduzir, remover acentos ou alterar qualquer valor.
- Municípios: `codigo_ibge → ibge_code`, `nome → name`, `uf → state`, `uf_nome → state_name`.
- Países: `iso2 → iso2`, `nome → name`.
- Inserir ou atualizar por chave (`ibge_code` e `iso2`) com `ON CONFLICT DO UPDATE`, sem duplicar e sem apagar registros.
- Conferir após a carga no banco: **5.570 municípios**, **250 países** e `4212254`, nome **Passo de Torres**, UF **SC** — apresentado como **Passo de Torres - SC**.

## B. Busca de municípios
- Buscar por nome sem diferenciar acentos nem maiúsculas: `sao joao` encontra nomes com **São João**, preservando a grafia oficial nos resultados.
- Quando o termo contiver somente números, buscar pelo início do código IBGE; o código completo `4212254` encontra Passo de Torres/SC.
- Ao abrir a busca com menos de 2 caracteres, mostrar **“Digite pelo menos 2 letras”** e não executar uma busca de resultados.
- Identificar separadamente se o catálogo está vazio e mostrar **“Catálogo de municípios ainda não importado”**. Essa mensagem terá prioridade quando a ausência do catálogo estiver confirmada.
- Reservar **“Nenhum município encontrado”** para catálogo importado e termo válido sem correspondências; manter o estado de busca em andamento e mostrar falhas de consulta sem confundi-las com catálogo vazio.
- Aplicar o comportamento no formulário compartilhado usado em Nova empresa e na edição de empresa; conferir qualquer outro consumidor antes de concluir. Atualmente só esse formulário realiza buscas de municípios.

## Detalhes técnicos
- Habilitar `unaccent` e `pg_trgm`; criar uma função própria `IMMUTABLE` com referência explícita ao dicionário de `unaccent` e normalização para minúsculas.
- Criar índice GIN de trigramas sobre o nome normalizado, compatível com a busca por trecho. Usar o mesmo normalizador na consulta e no índice. Criar índice apropriado para prefixos de códigos IBGE.
- Criar uma função SQL de busca `SECURITY INVOKER`, respeitando o RLS existente. Revogar execução de `PUBLIC`/`anon` e conceder somente aos papéis necessários, sem abrir os catálogos a visitantes.
- Manter a função autenticada do painel como ponto de acesso, retornando resultados e indicação explícita de catálogo vazio. Preservar a ordenação por nome e o limite de 30 resultados.
- Detectar catálogo vazio por consulta de existência independente do filtro e disponível ao abrir o campo, inclusive antes de digitar 2 caracteres.
- Registrar a regra estrutural de busca no AGENTS.md; não alterar permissões de organizações/empresas nem tocar em `transmissor/`.

## Validações
- Antes da carga: conferir cabeçalhos, códigos únicos e totais dos CSV; já conferidos **5.570** e **250** registros, sem códigos duplicados.
- Depois da carga: comparar todos os campos do banco com os CSV, conferir totais e a linha `4212254`; verificar que repetir a carga não duplica registros nem muda os valores.
- Testar no banco `sao joao`, variações de maiúsculas/acentos, `4212254`, prefixo numérico e termo sem correspondência; conferir os índices criados e o plano de consulta.
- Acrescentar e executar testes das regras de seleção por nome/código, limite de 2 caracteres e distinção entre catálogo vazio e ausência de resultados. Não testar textos ou estilos por snapshots.
- Conferir a busca na tela com sessão real, se disponível. Caso o Supabase externo não permita essa verificação, declarar a limitação sem afirmar validação de ponta a ponta.

## Limites
Somente carga dos catálogos e busca municipal. Nenhuma alteração em certificados, convênios, emissão, marca ou outras funcionalidades. Neste momento os dois catálogos estão vazios no banco; nenhuma migração ou mudança no aplicativo será aplicada antes da aprovação deste plano.
