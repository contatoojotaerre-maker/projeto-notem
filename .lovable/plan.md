# notem — Configuração fiscal e Serviços guiados

## Escopo
Redesenhar somente as abas **Configuração fiscal** e **Serviços**, mantendo a marca, permissões, códigos gravados, catálogos, auditoria, séries e reservas definitivas. A única alteração de estrutura será a nova alíquota opcional na configuração da empresa, com validação no banco. Não alterar Prontidão, conexão governamental, emissão ou arquivos em `transmissor/`.

## 1. Configuração fiscal

- **Resumo após salvar**, no topo, calculado exclusivamente a partir dos dados salvos. Exemplo: “Empresa do Simples Nacional (ME/EPP), ISS recolhido no DAS, tributos aproximados de 6,00%.” Adaptar a frase a MEI, não optante, outros regimes e tributos não informados.
- **Sua empresa é optante do Simples Nacional?** Três cartões selecionáveis: **Não**, **Sim, como MEI**, **Sim, como ME ou EPP**. Uma frase curta de ajuda.
- Para ME/EPP, **Como o ISS é recolhido?** Padrão em novas configurações: **Dentro do Simples (DAS)**. Outras opções: **ISS fora do Simples** (tributos federais continuam no Simples) e **Tributos federais e ISS fora do Simples**, com explicações curtas. Manter os três valores atuais do banco.
- **Percentual aproximado de tributos**: optantes veem apenas **Alíquota efetiva do Simples (%)**, com a ajuda solicitada; não optantes veem os três percentuais federal, estadual e municipal. Não pedir o modo no fluxo principal. Não preencher percentuais fictícios nem tratar campo vazio como zero.
- **Alíquota do ISS no Simples (%) — usada somente em notas com ISS retido pelo tomador**: aparece apenas para ME/EPP com ISS dentro do Simples. Opcional, mínimo **1,8%** quando preenchida. Ajuda: “Só é usada quando o cliente retém o ISS. A notem não envia este valor nas demais notas.” Diferenciar claramente esta alíquota daquela dos tributos aproximados.
- **Opções avançadas**, recolhida por padrão: regime especial (padrão **Nenhum**), opção **não informar** tributos aproximados e edição da série apenas para administrador da plataforma. Códigos somente aqui ou em detalhes técnicos.
- Após salvar, rodapé discreto: **Série da notem: 00001 (automática)**, usando a série real. Preservar auditoria; identificadores técnicos ficam em detalhes recolhidos.

### Preservação dos dados existentes
Abrir a aba não modifica valores nem grava nada. Os padrões se aplicam somente a configurações novas e a escolhas feitas pelo usuário. Percentuais já salvos continuam com sua precisão original; o resumo pode formatar duas casas sem arredondar o valor gravado.

Se um optante já usa percentuais separados por esfera, preservar e exibir essa escolha em Opções avançadas, sem conversão silenciosa para um percentual único. Ao mudar uma escolha que invalida percentuais ou a nova alíquota, informar o efeito antes de descartá-los; a mudança só será gravada ao salvar. Manter “não informar” existente, sem ativar percentuais automaticamente.

## 2. Serviços

Organizar o formulário em assuntos com perguntas e ajuda curta:

1. **Como você identifica este serviço?** Nome interno e situação ativo/inativo.
2. **Qual serviço sua empresa presta?** Busca no catálogo oficial, exibindo descrições completas em vez de códigos no campo e nos resultados. A busca por código continua funcionando; o código selecionado fica nos detalhes técnicos.
3. **O que deve aparecer na descrição da nota?** Discriminação padrão, preservando o limite de 2.000 caracteres.
4. **Como este serviço é tributado pelo ISS?** Opções com nomes, sem prefixos numéricos; padrão Operação tributável. Imunidade mantém pergunta condicional e descrição oficial.
5. **Quem retém o ISS?** Ninguém, tomador ou intermediário, mantendo os valores e padrão atuais.
6. **Opções avançadas**, recolhida: código municipal, NBS, indicador IBS/CBS, benefício municipal e detalhes técnicos. Preservar todas as buscas, descrições e validações já aprovadas.

Na lista de serviços, manter nome, descrição oficial e situação; retirar códigos da apresentação principal. Não criar nem guardar alíquota no perfil de serviço.

## 3. Detalhes técnicos e validações

- Adicionar `company_fiscal_settings.simples_iss_withholding_percent`, decimal opcional, inicialmente nulo em todas as linhas existentes. Usar a representação percentual já adotada no projeto, sem transformação dos demais campos.
- Validar no formulário, na função autenticada e por gatilho no banco: quando preenchida, aceitar somente ME/EPP (`simples_nacional_option = 3`) com ISS dentro do Simples (`simples_nacional_regime = 1`); mínimo 1,8%, respeitando também o limite oficial do campo `pAliq` no XSD. Não tornar o campo obrigatório para salvar a empresa.
- Preservar RLS e permissões existentes; nenhuma nova tabela, catálogo ou regra de acesso. Manter o bloqueio de CNPJ e a atribuição de série.
- E0713: continuar impedindo percentual do Simples para não optante. A referência também restringe `indTotTrib` para não optante na DPS; manter a opção “não informar” na configuração conforme solicitado, sem afirmar que ela já é válida para uma emissão futura.
- E0621/E0625 são regras da **nota**, com condições de competência, convênio ativo e benefício municipal, além do regime e retenção. Nesta tarefa, guardar apenas o parâmetro opcional da empresa. A futura montagem da DPS deverá exigir/usá-lo nos casos de retenção aplicáveis (incluindo intermediário segundo o anexo) e omiti-lo sem retenção. Não implementar emissão nem modificar `transmissor/`.
- Reaproveitar os controles e temas existentes; separar rótulos simples dos códigos persistidos. Seções abertas, sem cartões envolvendo seções inteiras; cartões somente para as três escolhas do Simples. Controles acessíveis por teclado, seleção evidente e estados somente leitura preservados.

## 4. Testes e aceite

- Testar mapeamento dos três cartões e dos três regimes para os valores atuais; padrão DAS apenas em nova escolha ME/EPP.
- Testar seleção automática de modo por situação, incompatibilidade do percentual do Simples com não optante, preservação de valores antigos e opção “não informar”.
- Testar nova alíquota: vazio válido; 1,79 recusado; 1,80 aceito; recusa fora de ME/EPP/regime 1 e acima do limite oficial. Repetir as validações por chamadas diretas ao banco com dados temporários e rollback.
- Executar os testes fiscais e de serviços existentes, garantindo que não mudaram imunidade, retenção, séries, permissões ou reserva definitiva.
- Conferir resumo, avançado recolhido, ausência de códigos no fluxo principal e legibilidade em computador e celular. Quando houver sessão de teste disponível, salvar e reabrir as duas abas com dados reais; no Supabase externo, informar explicitamente se esta verificação autenticada não puder ser realizada.

## Ordem de aplicação após aprovação
1. Conferir limite oficial de `pAliq` e aplicar migração aditiva com validação, sem alterar valores existentes.
2. Atualizar validação e leitura/gravação autenticada do novo campo.
3. Redesenhar as duas abas e os controles de seleção, preservando navegação e demais telas.
4. Executar testes locais/de banco e verificações visuais; relatar resultados e limitações.

**Até a aprovação:** nenhuma alteração no aplicativo ou no banco.
