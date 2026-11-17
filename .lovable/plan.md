# Novo visual do painel notem (neon, vidro, ondas de luz)

As imagens servem só de referência de estilo. Telas, textos, números, rotas, permissões, banco, API e `transmissor/` não mudam. A documentação (docs) continua igual.

## Direção visual

- **Cores da marca:** Midnight, Charcoal, Electric Lime, Acid Yellow e Cool Gray, mais ciano para os brilhos. Os degradês vão de verde-limão a ciano.
- **Regra da marca mantida:** o verde-limão serve de preenchimento ou destaque. Ele nunca vira texto sobre fundo claro. No tema claro, textos de destaque como "+2 emitidas fora da notem" ficam verde-escuro.
- **Fundo:** ondas de luz desenhadas por código (curvas suaves de limão e ciano). Ficam fixas no topo direito do conteúdo e no pé do menu lateral, com pouca opacidade e sem baixar imagens novas.
- **Cartões de vidro:** fundo translúcido, borda fina clara, sombra suave e cantos de 14 px. O desfoque fica só nas superfícies grandes, para não pesar.
- **Tipografia:** continua Plus Jakarta Sans. Títulos ficam mais fortes (700), com mais contraste de tamanho. Números grandes usam algarismos de largura fixa.
- **Título da página:** traço inclinado em limão antes do nome, como na referência, com o ambiente logo abaixo.
- **Títulos de seção:** ícone linear dentro de um quadradinho de vidro (Empresas, Notas, Integração, Alertas).
- **Menu lateral:** o item ativo ganha preenchimento em degradê limão com texto escuro e um brilho leve. A passagem do mouse fica sutil. Os grupos Notas e Organização continuam funcionando como hoje, e o contador de alertas vira uma bolinha vermelha.
- **Topo:** seletores de organização e ambiente em "pílulas" de vidro. A faixa "Produção — notas com validade fiscal" fica em pílula com escudo, e a de homologação continua âmbar e bem visível. Os botões de ajuda, tema e conta ficam redondos.

## Onde se aplica (todo o painel)

- **Peças comuns:** botões (o principal ganha degradê limão), campos, seletores, abas, caixas de diálogo, tabelas, selos de situação, avisos, listas vazias, trilha de navegação e paginação. Como as telas usam essas peças, listas, detalhes, formulários, abas de empresa e integração, Minha conta, Equipe e Administração mudam juntos.
- **Início:**
  - Os números viram cartões separados. O primeiro de cada bloco fica destacado: Total e Emitidas em limão, Chamadas à API em ciano.
  - Cada cartão ganha um ícone, e os cliques e atalhos continuam iguais.
- **Telas de entrada** (Entrar, Esqueci a senha, Definir senha, Redefinir senha): o cartão de vidro fica sobre o fundo da marca que já existe, com o botão em degradê e o brilho nas bordas.
- **Telas de erro** (não encontrada, sem acesso, falha ao carregar): seguem o mesmo estilo.

## Gráficos (só com dados que já existem)

1. **Rosca das notas,** ao lado dos três cartões de Notas e seguindo o período escolhido.
   - **Ponto de atenção:** hoje "Emitidas" já inclui as canceladas. Uma rosca "Emitidas 50% / Canceladas 50%" contaria a mesma nota duas vezes.
   - **Proposta:** três fatias que não se sobrepõem:
     - "Emitidas sem cancelamento" (emitidas menos canceladas)
     - "Canceladas"
     - "Rejeitadas pelo governo"
   - **Centro:** "N notas" (emitidas mais rejeitadas).
   - **Legenda:** quantidade e porcentagem.
   - **Sem notas no período:** a rosca aparece vazia, com "Nenhuma nota no período".
2. **Barras de chamadas das últimas 24 horas,** com uma barra por hora.
   - **Como é calculado:** usa a mesma conta que já gera o cartão "Chamadas à API", repetida para cada hora, sem tabela nem função nova.
   - **Custo:** são 24 consultas pequenas e rápidas. Elas carregam separadas, depois que o Início abre, e ficam guardadas por 1 minuto.
   - **Acesso:** só aparece para quem já vê o bloco de Integração.
   - **Texto alternativo:** um resumo legível, por exemplo "maior volume: 14h, 32 chamadas".
3. **"Empresas por status" ao longo do tempo:** não entra, porque não há histórico guardado.
   - **No lugar:** uma barra única "Situação agora", com prontas, com pendência e inativas, usando os números de hoje.
   - **Minha opinião sobre criar depois:** vale a pena só se você quiser acompanhar a evolução da carteira. Seria um registro diário pequeno (uma linha por organização, ambiente e dia, com três contagens), gravado pela verificação diária que já existe. O gráfico só ficaria útil depois de algumas semanas de coleta. Fica como sugestão para uma etapa própria, sem mexer em nada agora.

## Legibilidade, desempenho e movimento

- **Contraste:** pelo menos 4,5:1 para texto comum e 3:1 para ícones e bordas de campos, nos dois temas.
- **Teste de contraste:** um teste automático lê as cores do estilo e falha se algum desses pares ficar abaixo do mínimo.
- **Peso:** as ondas são desenhos leves feitos por código e o desfoque é moderado.
  - Celulares com tela pequena recebem menos desfoque.
  - Navegadores sem suporte a vidro recebem um fundo sólido equivalente.
- **Menos movimento:** só há transições curtas (passar o mouse, abrir grupos, a rosca aparecer). Nada fica em repetição. Com "reduzir movimento" ligado no sistema, tudo fica parado.
- **Celular e computador:**
  - Cartões em 2 colunas no celular e 4 no computador.
  - A rosca e as barras vão para baixo dos cartões em telas estreitas.
  - O menu continua abrindo por cima no celular.
  - O topo se reorganiza sem cortar texto.

## Documentação intacta

Hoje a documentação reaproveita as cores gerais do painel. As novas cores e efeitos ficam presos ao painel. Um teste confere que as cores usadas pela documentação continuam exatamente as atuais.

## Verificação e entrega

- **Testes:** os automáticos atuais, mais os novos de contraste, de documentação intacta, das contas da rosca (fatias sem sobreposição e período vazio) e das horas das barras (24 horas no horário de Brasília).
- **Imagens das telas de entrada:** prints nos dois temas, no computador e no celular.
- **Telas com login:** não consigo entrar na sua conta pela pré-visualização. Faço prints com uma página temporária de conferência, com dados fictícios, que é apagada antes de terminar. Os prints reais com login ficam marcados como não verificados.
- **Publicação:** só depois da sua aprovação.

## Decisões para você confirmar

1. A rosca com as três fatias sem sobreposição descritas acima.
2. As barras por hora feitas com 24 consultas pequenas, em vez de uma função nova no banco.
3. A barra "Situação agora" no lugar do gráfico de Empresas por status.

## Detalhes técnicos

- **Cores:** os tokens novos ficam em `src/styles.css`, presos a um atributo do painel (por exemplo `data-surface="panel"` no `<html>` das rotas do app). O handler da documentação não define esse atributo, então a docs recebe os valores atuais.
- **Ondas:** SVG inline com `pointer-events:none`, `aria-hidden` e degradê linear. O vidro usa `backdrop-filter` só em cartões, topo e menu. Há `@supports not (backdrop-filter)` com fundo sólido e `@media (prefers-reduced-motion: reduce)`.
- **Peças comuns:** variantes do shadcn (Button `default` com degradê, Tabs, Input, Select, Dialog, Table, Badge) mais as classes compartilhadas (`.glass-panel`, `.metric`, `.nav-item`, `.data-table`, `.status-badge`, `.page-heading`).
- **Gráficos:** feitos em SVG próprio, sem biblioteca nova.
  - As contas ficam em funções puras em `src/lib/home-metrics.ts`, com testes.
  - As barras usam um server function novo, autenticado, que chama `org_integration_summary` 24 vezes com a mesma checagem de papel do resumo atual. É uma consulta separada em React Query com `staleTime` de 60 s.
- **Fora do escopo:** nenhuma mudança em migrações, RLS, API `/api/v1`, OpenAPI, `docs/` ou `transmissor/`.
