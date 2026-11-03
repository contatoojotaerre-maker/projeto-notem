# notem — Configuração fiscal da empresa e perfis de serviço

## Escopo e limites

Implementar as abas **Configuração fiscal** e **Serviços**, a estrutura de séries/numeração DPS e os ajustes solicitados em **Prontidão**. Nenhuma emissão, montagem, assinatura ou transmissão de DPS; nenhuma API de parceiros ou modelo de serviço por organização. Não criar, editar, mover nem apagar arquivos em `transmissor/`.

Os catálogos serão criados **vazios**: você executará a carga SQL de 338 serviços, 918 NBS e 26 indicadores. Não aplicar neste trabalho a carga pendente de municípios/países nem outras correções anteriores.

## 1. Tabelas e integridade

### Catálogos oficiais

| Tabela | Campos |
|---|---|
| `service_codes` | `code` (PK, texto de 6 dígitos), `description`, `group_description` |
| `nbs_codes` | `code` (PK, texto de 9 dígitos), `formatted_code`, `description` |
| `ibscbs_operation_indicators` | `code` (PK, texto de 6 dígitos), `operation_type`, `operation_location`, `supply_characteristic`, `location_to_identify` |

Preservar zeros iniciais, códigos e descrições oficiais. Busca por código ou texto, ignorando acentos e maiúsculas, com índices e normalização imutável no padrão municipal existente. Para indicadores, pesquisar os campos descritivos disponíveis. Distinguir catálogo não importado de ausência de resultados e exigir pelo menos 2 caracteres para a busca.

### `company_fiscal_settings`

Uma linha por empresa, com FK composta `(company_id, organization_id)` para `companies`, campos fiscais, série e auditoria de criação/última alteração.

- `simples_nacional_option`: obrigatório, `1 Não optante`, `2 Optante MEI`, `3 Optante ME/EPP`.
- `simples_nacional_regime`: obrigatório apenas na opção 3; nulo nas opções 1/2. Valores: `1 Tributos federais e municipal pelo SN`, `2 Federais pelo SN e ISSQN por fora do SN`, `3 Federais e municipal por fora do SN`.
- `special_tax_regime`: padrão 0; `0 Nenhum`, `1 Ato Cooperado`, `2 Estimativa`, `3 Microempresa Municipal`, `4 Notário ou Registrador`, `5 Profissional Autônomo`, `6 Sociedade de Profissionais`, `9 Outros`.
- `approx_taxes_mode`: `percent_simples`, `percent_by_sphere` ou `none`. Sugerir o primeiro para opções 2/3 e o segundo para opção 1, sem substituir silenciosamente a escolha do usuário.
- Percentuais em campos decimais de 0 a 100: um percentual obrigatório em `percent_simples` (somente opções 2/3), três percentuais obrigatórios em `percent_by_sphere`; sem percentuais em `none`, correspondente a `indTotTrib = 0`. Zero é valor válido. Campos incompatíveis com o modo ficam nulos.
- `dps_series`: inteiro de 1 a 49999, exibido com cinco dígitos (`00001` etc.). Gerado no primeiro salvamento; somente administrador da plataforma pode alterá-lo.

Validações condicionais também no banco; editor/data definidos pelo banco, não por valores enviados pelo formulário.

### `dps_sequences`

Chave `(company_id, series, environment)`, com organização coerente, CNPJ associado e próximo número. Produção e homologação são independentes; primeiro número 1, último número reservável `999999999999999`.

- A atribuição de série cria as duas sequências sem reservar números.
- A mesma série de um CNPJ não pode pertencer a empresas de organizações diferentes. Restrições de unicidade e atribuição transacional impedem colisões, inclusive simultâneas.
- Guardar as sequências anteriores quando a série mudar: retornar a uma série da mesma empresa continua a numeração, sem reiniciar; outra empresa não pode reutilizar essa série reservada.
- Não permitir edição direta, redução do contador ou exclusão das sequências pelos usuários.
- Ao atingir o limite, recusar nova reserva sem ultrapassar a faixa permitida nem reaproveitar número.

### `company_service_profiles`

Várias linhas por empresa, com `id`, FK composta empresa/organização e auditoria:

- `name`, `active`; criar ativo por padrão, permitindo desativar/reativar.
- `service_code`: FK obrigatória para `service_codes`; `municipal_tax_code`: texto livre opcional.
- `nbs_code`: FK opcional; `ibscbs_operation_indicator`: FK opcional.
- `default_description`: até 2000 caracteres.
- `iss_taxation`: padrão 1; `1 Operação tributável`, `2 Imunidade`, `3 Exportação de serviço`, `4 Não incidência`.
- `immunity_type`: obrigatório somente com tributação 2, inclusive código 0; nulo nas outras opções. Códigos 0–5 conforme XSD.
- `iss_withholding`: padrão 1; `1 Não retido`, `2 Retido pelo tomador`, `3 Retido pelo intermediário`.
- `municipal_benefit_number`: opcional.

**Não incluir alíquota no perfil.** Ela será consultada nos parâmetros municipais em cada emissão futura.

## 2. Permissões e funções seguras

Todas as novas tabelas terão RLS e concessões explícitas na mesma migração, na ordem criação → concessões → RLS → políticas.

| Recurso | Leitura | Escrita |
|---|---|---|
| Catálogos | Usuários autenticados | Apenas `service_role` |
| Configuração fiscal e perfis | Membros da organização ou admin da plataforma | Owner/admin da organização ou admin da plataforma |
| Sequências | Membros da organização ou admin da plataforma | Apenas funções autorizadas de atribuição/reserva; sem escrita direta por usuários |
| Alterar série DPS | Mesma leitura da configuração | Apenas admin da plataforma, também validado no banco |

Sem acesso anônimo e sem acesso por membros de outra organização. Manter as seis funções atuais de autorização, usando `auth.uid()` e os papéis protegidos existentes.

Funções autenticadas do painel para ler/salvar configuração, listar/criar/editar/ativar/desativar perfis e pesquisar catálogos. As leituras iniciais seguem os carregamentos e consultas existentes do painel.

**Atribuição de série:** operação transacional no banco, bloqueio por CNPJ e escolha da menor série livre (`1, 2, 3…`), considerando todas as organizações. Recusar colisão e esgotamento da faixa. Não confiar em cálculo no navegador.

**Reserva de número:** função SQL transacional chamada por função autenticada do servidor, com autorização owner/admin/admin da plataforma e conferência de empresa/organização/série/ambiente. Bloqueio da sequência e incremento atômico; retorna apenas o número reservado. Não haverá botão de reserva no painel nem chamada automática ao abrir/salvar telas.

Como o CNPJ da empresa é editável hoje, sincronizar sua associação fiscal pelo banco e recusar mudanças que colidam com séries já reservadas; preservar contadores. A organização da empresa permanece imutável. Não alterar neste escopo o fluxo de certificados.

## 3. Telas

### Configuração fiscal

Substituir apenas o conteúdo provisório da aba existente por formulário com Simples Nacional, regime de apuração condicional, regime especial, tributos aproximados e série DPS. Mostrar campos de percentual conforme o modo e quem alterou/quando.

Série somente leitura para owner/admin; edição disponível para admin da plataforma, com erro claro para série fora da faixa ou já reservada. Demais membros visualizam os valores sem controles de edição.

### Serviços

Substituir o conteúdo provisório por lista de perfis, indicação ativo/inativo e formulário de criação/edição com os campos solicitados. Usar desativação, sem exclusão definitiva nesta fase.

Seleção de serviço, NBS e indicador por busca; mostrar código e descrição oficial completa após a escolha. Quando o catálogo obrigatório estiver vazio, informar isso e impedir o salvamento de um perfil sem serviço válido. Imunidade aparece somente para tributação 2.

Descrições resumidas de imunidade para o seletor, baseadas no XSD: 0 Imunidade (tipo não informado); 1 Entes federativos; 2 Templos de qualquer culto; 3 Partidos políticos, sindicatos e instituições sem fins lucrativos; 4 Livros, jornais, periódicos e papel; 5 Fonogramas e videofonogramas musicais brasileiros. Exibir também a redação oficial completa do XSD, com referências constitucionais e ressalvas, para o valor selecionado.

Preservar tema, marca, abas, navegação e comportamento das demais telas.

## 4. Prontidão

- Para `aderenteAmbienteNacional`, `aderenteEmissorNacional` e `aderenteMAN`, aplicar exatamente a apresentação pedida: `1 = Sim`, `0 = Não`, `-1 = Não informado`. Valor inesperado permanece `código X`, sem inferência.
- `situacaoEmissaoPadraoContribuintesRFB`: `código X` e nota **“interpretação provável: 1 = habilitados por padrão”**, sem atribuir confirmação oficial.
- HTTP 404 **com mensagem de convênio não ativo**: “Homologação indisponível neste município” em homologação ou “Município não atendido” em produção. Não transformar qualquer 404 nessa situação; preservar a mensagem original e os detalhes.
- Adicionar itens locais somente leitura: **Certificado válido**, **Configuração fiscal preenchida**, **Ao menos um serviço ativo**. Calcular com dados salvos; certificado deve estar ativo, dentro da validade e corresponder ao CNPJ atual. Configuração preenchida exige todos os campos condicionais válidos e série atribuída.
- Abrir/atualizar esses itens não chama o governo. Preservar o botão Verificar, o histórico e o intervalo mínimo de um minuto por empresa/ambiente.

**Referências conferidas:** a faixa da série vem da regra E0010 do Anexo I; o XSD v1.01 fornece os códigos de imunidade. O Swagger usa `TipoSimNao` com 0/1/-1, mas não publica rótulos textuais nem define todo 404 como convênio inativo: as apresentações acima seguem sua decisão, mantendo os valores/mensagens originais nos detalhes.

## 5. Testes e aceite

Testes de regras locais e testes de integração do banco, sem testar cópia visual ou snapshots:

1. Simples 1/2 sem regime; opção 3 com regime obrigatório e valores válidos.
2. Tributação 2 exige imunidade 0–5; outras tributações não guardam imunidade.
3. Percentuais exigidos por modo, limites 0/100, aceitação de zero, incompatibilidade de `percent_simples` com não optante e ausência de percentuais em `none`.
4. Série aceita 1/49999; recusa 0/50000/70000; CNPJ compartilhado recebe séries distintas entre organizações; edição só por admin da plataforma.
5. Atribuições concorrentes sem série duplicada; mudança/retorno de série preservam números e reservas anteriores.
6. Reservas concorrentes retornam números distintos; ambientes iniciam separadamente em 1; limite máximo retorna uma vez e depois recusa; contador não pode ser reduzido diretamente.
7. Owner/admin/admin plataforma editam; operator/viewer/developer só leem; não membro e usuário anônimo não acessam; FK recusa organização incoerente. Exercitar chamadas diretas ao banco, além do formulário.
8. Busca por código/descrição sem acento e estados de catálogo vazio, termo curto e nenhum resultado; FK recusa código inexistente.
9. Mapeamento 1/0/-1 do convênio, preservação de códigos inesperados e tratamento condicionado de 404 por ambiente.
10. Itens locais de prontidão, incluindo certificado vencido/CNPJ divergente, configuração incompleta e perfil inativo.

Verificar navegação, salvamento e leitura posterior nas duas abas, estados somente leitura e exibição da Prontidão. Catálogos reais dependem da sua carga SQL; verificações autenticadas na tela dependem de sessão de teste disponível no Supabase externo. Relatar separadamente qualquer teste não executado, sem afirmar aceite de emissão ou de conexão governamental.

## Ordem de aplicação após aprovação

1. Migração: seis tabelas, concessões/RLS, validações, índices, auditoria e funções atômicas; sem carga de catálogos.
2. Funções autenticadas, consultas e formulários das abas existentes.
3. Ajustes pontuais de Prontidão.
4. Testes locais, testes de banco e conferência das telas; resultado e limites de validação.

**Neste momento:** somente planejamento; nenhuma migração ou mudança de aplicativo aplicada.