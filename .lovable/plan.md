# Etapa E2 — DANFSe em PDF e proteção da numeração

## Escopo e referências
Implementar somente após aprovação. Reproduzir o DANFSe v2.0 da imagem enviada; usar a logomarca oficial enviada, sem substituir a identidade ou o favicon da notem. Não criar, editar, mover ou apagar nenhum arquivo em `transmissor/`. Cancelamento/substituição e emissão IBS/CBS não serão implementados nesta etapa: apenas sua representação no PDF, quando os dados/situações já existirem.

## 1. DANFSe fiel ao modelo
- Página única A4 retrato, fonte sem serifa embutida com acentos, mesmas colunas, seções, títulos, ordem e proporções do modelo. Canhoto ausente por padrão.
- Guardar a logo original transparente em `public/danfse/logo-nfse-oficial.png`, conforme destino solicitado; a imagem do documento é referência visual, não o fundo do PDF.
- Cabeçalho com logo à esquerda, título ao centro e município/UF, ambiente gerador e tipo de ambiente à direita. Em homologação (`tpAmb = 2`), exibir **NFS-e SEM VALIDADE JURÍDICA** em vermelho.
- Reproduzir todas as seções: identificação da NFS-e/DPS; emitente/situação/finalidade; prestador; tomador; destinatário/intermediário; serviço; ISSQN; tributos federais exceto CBS; IBS/CBS; valores totais; informações complementares.
- Exibir as linhas de destinatário/intermediário não identificados quando os grupos estiverem ausentes. Manter os campos IBS/CBS mesmo sem dados, com `-`, sem preencher zeros por suposição.
- Dados fiscais exclusivamente do XML autorizado, incluindo nomes, endereços, descrições oficiais e valores. Não completar pelo cadastro atual da empresa, tomador, perfil ou catálogo. Ausência = `-`; zero explicitamente presente continua zero. Rótulos fixos e traduções de códigos somente conforme referência oficial; sem significado confirmado, mostrar o código.
- Exceções explícitas à origem XML: situação atual da nota, para situação/marca d’água, e preferência de canhoto da empresa. Canceladas, inclusive pela prefeitura: **CANCELADA**; substituídas: **SUBSTITUÍDA**. Sem modificar o XML original.
- QR Code e link público: `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave}`; incluir integralmente o texto de autenticidade solicitado.
- Mascarar CPF/CNPJ/CEP; formatar valores em reais e datas `dd/mm/aaaa hh:mm:ss`, preservando o horário/offset do XML. Código IBGE segue o modelo.
- PIS/COFINS de apuração própria somente quando a competência for até **31/12/2026**. Manter a frase de tributos aproximados da Lei nº 12.741/2012, com valores/percentuais realmente informados por esfera ou percentual do Simples; ausentes ficam `-`, sem estimativas próprias.
- Medir e quebrar linhas para descrições/endereço/informações longas; ajustar a composição dentro da página única sem sobreposições nem corte silencioso. Testar também os limites de texto aceitos pela API.

## 2. Download e opção de canhoto
- Gerar PDF sob demanda a partir do XML autorizado armazenado e da situação atual; não persistir PDF como fonte definitiva nem reutilizar documento com situação antiga.
- `GET /api/v1/notas/{id}/pdf`: substituir `503 PDF_EM_PREPARACAO` por `200 application/pdf`, com nome de download e sem cache de documento desatualizado. Disponível para autorizada, cancelada e substituída, incluindo cancelada pela prefeitura, sempre com XML autorizado. Demais situações ou XML ausente: `404`.
- Preservar autenticação por chave, ambiente, organização, `X-Request-Id` e registro sanitizado; outra organização/ambiente continua recebendo `404`.
- No detalhe da nota, adicionar **Baixar PDF** com preparação, resultado e erro em português. Usar a sessão do painel, não a chave da integração.
- Atualizar `links.consulta_publica` quando houver chave válida; manter `links.pdf` no endereço oficial da API. Não tornar PDF/XML públicos.
- Adicionar **Imprimir canhoto no DANFSe** à configuração da empresa, desligado por padrão para existentes e novas; somente os papéis que já podem editar a configuração poderão alterá-lo. Documentar a opção também no contrato fiscal da API, preservando seu valor nas atualizações que não a informarem.

## 3. Séries automáticas a partir de 900
- Alterar exclusivamente novas atribuições automáticas: primeira série livre por CNPJ entre **900 e 49999**, com o bloqueio transacional existente.
- Preservar séries e contadores atuais, inclusive série 1; não renumerar notas, não reiniciar contadores e não reduzir a faixa permitida de séries já existentes.
- Manter separação por ambiente na numeração e exclusividade de série por CNPJ entre organizações. Se a faixa se esgotar, recusar com mensagem clara, sem voltar à série 1.

## 4. E0014: saltos controlados, sem duplicar emissão
**Evidência:** o Anexo I local define E0014 como DPS cujo conjunto série/número/município/documento já gerou uma NFS-e. O código, sozinho, não comprova que outro sistema a enviou.

- Fazer salto automático somente diante de rejeição explícita **E0014** no envio conhecido; não aplicá-lo a timeout, erro de conexão, resposta ambígua ou DPS encontrada na reconciliação de um envio anterior. Nesses casos, manter a consulta atual para não criar uma segunda nota.
- Se houver outras rejeições junto de E0014, manter o fluxo normal de rejeição; não esconder problemas de negócio por meio da troca de número.
- Registrar permanentemente cada número recusado como **usado externamente**, com série, ambiente, identificador DPS e resposta original; nunca liberar/reutilizar. Preservar os XML e o histórico de cada tentativa, não só a DPS final.
- Reservar o próximo número, remontar com os mesmos dados fiscais congelados e persistir número/XML antes de chamar novamente o transmissor existente. Nova DPS será assinada por ele, sem alterações no serviço.
- Interpretar o limite como **até cinco saltos/reenvios além da tentativa inicial**: máximo seis envios com números diferentes. Contador persistente por nota, não reiniciado por repetição da `Idempotency-Key` nem por reinício do processo.
- Manter o mesmo ID da nota, ID externo, chave de idempotência e hash do pedido durante os saltos. Na linha do tempo, mostrar série, número anterior/novo e motivo E0014. Não emitir webhook de rejeição intermediária; apenas resultado final.
- Ao esgotar os cinco saltos, encerrar como rejeitada com orientação em português e detalhes originais. Se houver ambiguidade em qualquer novo envio, parar os saltos e consultar aquela DPS.
- Preservar o orçamento de espera da API: não multiplicar seis vezes os cerca de 20 segundos atuais. Quando não houver tempo para continuar, retornar `202` e persistir continuação limitada no agendador já existente, sem depender de `waitUntil`.

## 5. Testes, comparação visual e documentação
- Construir XML de teste com os dados visíveis no modelo; identificá-lo como fixture sintética, não como XML oficial recuperado da imagem. Dados não visíveis permanecem ausentes. A imagem permite comparação visual, mas não provar a estrutura do XML original.
- Gerar PDF e PNG da página em `docs/exemplos/danfse/`: modelo base, homologação, cancelada, substituída, com canhoto, tomador estrangeiro e com desconto. Incluir explicação e fonte dos exemplos.
- Inspecionar visualmente todos os exemplos: margens, proporções, quebras, acentos, QR legível, marca d’água, canhoto e ausência de cortes/sobreposição. Entregar as imagens para sua comparação, relatando qualquer diferença.
- Testar valores ausentes versus zero, origem exclusiva XML (mesmo com cadastro divergente), máscaras, datas, percentuais do Simples e fronteira PIS/COFINS em **31/12/2026** e **01/01/2027**. Decodificar o QR gerado e conferir a URL completa.
- Testar série inicial 900, próximas séries livres, existentes preservadas, esgotamento, isolamento por ambiente/CNPJ; E0014 seguida de sucesso, cinco saltos, nenhuma sétima tentativa, erros diferentes, respostas ambíguas, repetição idempotente e concorrência.
- Testes de banco com rollback: reservas definitivas, limite persistente, histórico por tentativa, concessões/RLS e nenhuma gravação/execução privilegiada aberta aos membros.
- Atualizar `docs/api/notas.md`, `empresas.md`, `openapi.yaml`, referências do DANFSe, `AGENTS.md` e roadmap no mesmo trabalho. Remover a indicação vigente de PDF em preparação e de consulta pública sem formato confirmado.
- Verificar download real e geração no ambiente publicado após aprovação; registrar emissão real/A1 e painel autenticado como **não verificados** quando não houver acesso de teste. Não declarar validação em produção com base apenas em testes locais.

## Detalhes técnicos
- Parser seguro compartilhado para XML NFS-e, sem DTD/entities, valores decimais preservados e limite de tamanho. Modelo de impressão separado dos snapshots de emissão.
- `pdf-lib` com fonte Unicode via `@pdf-lib/fontkit` e biblioteca QR JavaScript pura; sem navegador, binário nativo ou dependência de filesystem no servidor publicado. Fonte/logo carregadas por caminho empacotado ou endereço de asset explícito, nunca pelo origin do solicitante.
- Gerador único server-only para API e função autenticada do painel. Download por Blob no painel com fluxo compatível com dispositivos móveis.
- Migração para preferência do canhoto, alocação automática e reservas/histórico de saltos; operações privilegiadas restritas a service role após autorização, com leases, bloqueios e limite persistente.
- Reutilizar o agendador Google OIDC e fila PostgreSQL existentes. Retransmissão só na exceção explícita E0014; reconciliação ambígua continua sem retransmissão.

## Ordem de aplicação
1. Modelo XML/DANFSe, preferência do canhoto e exemplos para comparação.
2. API/download no painel, links e documentação.
3. Séries a partir de 900 e tratamento durável E0014.
4. Testes, inspeção visual e verificação publicada autorizada.

**Neste momento:** somente plano; nenhuma mudança na aplicação, no banco, na publicação ou em `transmissor/`.