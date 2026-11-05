# notem — Fase 3A.2: Webhooks e ajustes de Integrações

## Escopo e contrato
Contrato lido: `docs/api/webhooks.md` e `docs/api/convencoes.md`. Implementar configuração, entrega assinada, reenvios e **somente o disparo real de `webhook.teste`**. Os outros 13 tipos do contrato ficam disponíveis para assinatura, mas seus produtores e dados específicos pertencem às fases futuras.

Preservar a API oficial `https://app.notemfiscal.com.br/api/v1`, os ambientes e permissões existentes. Não criar API de cadastro de webhooks, emissão, página pública de documentação nem alterar `transmissor/`.

## 1. Viabilidade primeiro: segurança e agendamento
- Propor **Inngest**, serviço de execução durável disponível por conexão, para acordar entregas e aguardar os intervalos exatos sem uma varredura permanente do banco. Será necessário conectar e sincronizar o serviço após aprovação; uso e custos dependem do plano contratado. Nada será conectado nesta etapa.
- Não utilizar `pg_cron` + `pg_net` para chamadas HTTP: esse caminho não é suportado para o Supabase externo deste projeto. `pg_cron` permanece apenas na limpeza SQL diária já existente.
- Antes das tabelas definitivas, comprovar no ambiente publicado: recebimento autenticado das chamadas do serviço, execução após a resposta do painel, retomada de trabalho interrompido e agendamento durável.
- Comprovar também uma conexão HTTPS cujo destino seja o **IP público validado**, mantendo Host, SNI e validação do certificado do domínio original. Apenas consultar DNS e depois fazer `fetch` pelo nome não evita troca maliciosa de DNS entre as duas operações.
- Recusar URLs com credenciais, localhost, IPs privados/reservados/link-local e equivalentes IPv4/IPv6; verificar todos os endereços resolvidos e repetir a validação antes de cada tentativa. Não seguir redirecionamentos.
- **Limitação a resolver antes de prosseguir:** o controle de conexão/IP no servidor hospedado ainda não foi comprovado. Se não for suportado, parar e apresentar a necessidade de um serviço de saída dedicado, separado do transmissor, para aprovação. Não substituir por validação DNS parcial nem anunciar proteção completa sem evidência.

## 2. Banco, segredos e permissões
Criar migração com concessões explícitas, RLS e vínculos compostos garantindo organização, integração e ambiente consistentes.

| Tabela | Conteúdo e regras |
|---|---|
| `webhook_endpoints` | Campos do brief, URL, eventos, situação, motivo, auditoria, prefixo, último sucesso e início das falhas. `secret` e `previous_secret` contêm envelopes cifrados, nunca texto legível. Expiração do anterior em 24 h. |
| `webhook_events` | ID `evt_`, contexto, tipo, payload contratual imutável e criação. Persistir os bytes JSON usados nas tentativas para assinar e reenviar exatamente o mesmo corpo. |
| `webhook_deliveries` | ID `whd_` por tentativa, evento/endereço, número, estado, próxima execução, HTTP, resposta sanitizada até 4 KB UTF-8, duração, erro seguro e criação. Acrescentar identificador do ciclo manual e controle de reserva/expiração para retomada concorrente. |
| `webhook_alerts` | Alerta persistente, restrito à organização, para desativação automática; deduplicado por episódio de falhas e exibido no painel. Não incluir e-mail nesta fase. |

- Membros e administrador da plataforma leem somente metadados autorizados. Revogar concessões herdadas antes de conceder SELECT apenas nas colunas seguras dos endereços; segredos cifrados também não chegam ao navegador.
- Nenhuma escrita direta por `anon` ou `authenticated`. Servidor possui os privilégios necessários; operações de gestão verificam sessão/papel antes de carregar o cliente privilegiado e repetem a autorização nas operações transacionais.
- **Owner/admin/developer e administrador da plataforma** gerenciam; **operator/viewer** apenas consultam. Organização/integração/ambiente não podem ser trocados para mover registros.
- Cifrar segredos com AES-256-GCM, nonce único, versão de chave e contexto do endereço como dados autenticados. Chave de cifração criada no armazenamento seguro do servidor após aprovação; nunca no banco ou código.
- `whsec_` aleatório com 256 bits, revelado uma vez em criação/troca, resposta sem cache; nenhum segredo em logs, consultas armazenadas ou armazenamento do navegador. Troca serializada e atômica; a nova troca substitui a janela anterior, mantendo somente atual e anterior.
- Exclusão com confirmação interrompe novas entregas e elimina o material secreto; preservar tentativas/eventos para o histórico de 90 dias com remoção lógica do endereço.

## 3. Motor único e entrega
- Criar helper exclusivo de servidor **`emitWebhookEvent(...)`**, validando tipo, contexto e dados; gravar evento e tentativas iniciais de todos os endereços ativos assinantes da mesma integração/ambiente numa transação.
- Preservar exatamente o envelope: `id`, `tipo`, `criado_em`, `ambiente` (`homologacao`/`producao`), `organizacao_id`, `integracao_id`, `dados`. Propor `dados: {}` para `webhook.teste`, já que o contrato não define campos extras; documentar esse exemplo sem inventar dados de notas.
- Assinar os bytes do corpo com HMAC-SHA256 de `{t}.{corpo_bruto}`, hexadecimal minúsculo. Enviar `Notem-Assinatura: t=...,v1=...` e os três identificadores contratados. Durante 24 h da troca, acrescentar segundo `v1` com o segredo anterior. Timestamp renovado em cada tentativa; ID do evento estável e ID de entrega próprio de cada tentativa.
- Primeira tentativa imediata em `waitUntil` comprovado no servidor publicado. Registrar também trabalho durável idempotente para recuperar interrupções; nunca depender de promessa solta ou somente do tempo de vida da requisição. Se o contexto de execução não estiver disponível na operação, informar essa limitação antes de substituir o mecanismo.
- Aguardar no máximo **10 s** pela tentativa completa, incluindo leitura limitada da resposta; **2xx** é sucesso. Erro, timeout, redirecionamento ou outro HTTP é falha.
- Reenvios com **intervalos entre tentativas** de **1 min, 5 min, 30 min, 2 h, 6 h, 12 h e 24 h**: oito tentativas automáticas. Após a oitava falha, `exhausted` (apresentado como falha/esgotado no painel).
- Sucesso atualiza `last_success_at` e encerra o episódio de falhas. A primeira falha inicia `failing_since`; agendar uma verificação única para +3 dias. Se o episódio continuar sem sucesso, desativar, registrar motivo e criar alerta, mesmo sem novas tentativas naquele momento.
- Reenviar manualmente mantém o evento/corpo, inicia ciclo novo com IDs de entrega novos e exige endereço ativo; não reiniciar silenciosamente endpoint desativado.
- Claim transacional e chave única por evento/endereço/ciclo/tentativa impedem dois processadores de executar a mesma tentativa ao mesmo tempo. Reserva com expiração permite recuperação. A entrega continua **pelo menos uma vez**, não exatamente uma vez: um destinatário pode receber novamente após falha de confirmação; orientar deduplicação por `evt_`, conforme contrato.
- Fila persistida antes de acordar o serviço, com confirmação e reconciliação durável de publicações pendentes. Lotes pequenos e concorrência de saída limitada para respeitar o servidor hospedado; nenhuma varredura frequente permanente.

## 4. Painel
### Aba Webhooks
- Homologação/Produção: URL, descrição, tipos assinados, ativo/com falhas/desativado, motivo e último sucesso.
- Adicionar/editar: HTTPS, descrição, caixas com os 14 eventos e explicação simples, opção Todos. Diálogo de segredo com copiar e aviso de exibição única.
- Ativar/desativar, trocar segredo com aviso de validade anterior por 24 h, enviar teste e excluir com confirmação. Ações ausentes para quem só pode consultar.
- Histórico paginado por ambiente/endereço: evento, data, tentativa, HTTP, duração, resposta resumida; filtro somente falhas, detalhe sanitizado e Reenviar quando aplicável.
- Alerta persistente de desativação visível à organização no painel, com ligação ao endereço afetado. Estados vazio, carregamento, erro e somente leitura seguem o padrão existente.

### Ajustes solicitados
- Selo **Ativa verde sucesso**, **Inativa cinza**, na lista e no detalhe.
- Trocar lixeira das chaves por **Revogar**, preservando confirmação e histórico. Ativas em destaque; revogadas em seção recolhida **Revogadas**, com data e nome de quem revogou obtido por leitura autorizada.
- Abaixo do prefixo: **“Identificação apenas — a chave completa não fica guardada”**.
- Como testar mantém curl para API oficial e acrescenta exemplo Node ou Python: corpo bruto, extração de múltiplos `v1`, comparação de tempo constante e tolerância absoluta de **5 min**, rejeitando assinaturas inválidas e timestamps futuros além da janela.

## 5. Documentação e detalhes técnicos
- Atualizar OpenAPI 3.1 com seção raiz `webhooks`, POST da mensagem, cabeçalhos, envelope e exemplo `webhook.teste`; documentar respostas 2xx esperadas. Sem inventar schemas dos eventos futuros.
- LEIAME passa a listar `webhooks.md`; atualizar documentação de qualquer callback técnico novo no mesmo trabalho, distinguindo-o da API pública v1.
- Callback de execução durável sob `/api/public/`, protegido por assinatura do Inngest; não autorizar por URL pública nem pela chave da integração. Não expor payloads privados ou segredos na descoberta do serviço.
- Reutilizar funções autenticadas, carregamento por consultas e sanitização existentes; separar schemas seguros, gestão, assinatura e execução no servidor.
- Registrar em AGENTS.md, em inglês, o helper único obrigatório para fases futuras e as fronteiras de segurança/agendamento, somente quando implementados.
- Ampliar a limpeza **SQL diária existente às 03:00 UTC** para eventos, entregas e alertas históricos acima de 90 dias, em ordem compatível com os vínculos. Uma execução/dia; remoção física pode levar até 24 h adicionais. Consultas do painel excluem dados fora da retenção.

## 6. Testes e aceite
1. Assinatura sobre corpo exato, dois segredos por 24 h, expiração e exemplo com ±5 min e comparação segura.
2. Oito tentativas, intervalos concretos, timeout 10 s, somente 2xx, exhausted e ciclo manual.
3. Falhas contínuas por 3 dias, sucesso reiniciando episódio, desativação e alerta único.
4. SSRF: localhost, 10.x, 192.168.x, 169.254.x, demais faixas reservadas, IPv6 local/mapeado, resolução privada, DNS alterado e redirect recusado; evidência da conexão protegida no ambiente real.
5. Isolamento de organizações/ambientes, cada papel, escrita direta recusada e ausência de segredos/ciphertext nas respostas de leitura e logs; sanitização/truncamento UTF-8 em 4 KB e retenção 90 dias.
6. Concorrência real, reserva recuperável e interrupção entre persistência, publicação, envio e confirmação; nenhum trabalho perdido silenciosamente.
7. Fluxo conectado: criar endereço → copiar segredo uma vez → enviar `webhook.teste` a receptor HTTPS externo controlado → validar corpo/assinatura → ler histórico → simular falha/reenvio → trocar segredo. Não enviar dados reais de clientes a receptor público de terceiros.
8. Regressões das chaves e API; verificar abas em desktop/celular. Sessão do Supabase externo e receptor controlado são dependências do aceite; se indisponíveis, relatar precisamente os testes não executados, sem afirmar fluxo validado.

## Ordem após aprovação
1. Conectar agendamento durável e provar saída segura, callback e execução imediata no ambiente publicado; parar se houver limitação.
2. Aplicar migrações, proteção de segredos, claims, alertas e retenção.
3. Implementar motor único, retries e callbacks; atualizar contrato técnico no mesmo trabalho.
4. Implementar aba Webhooks e somente os ajustes de Integrações solicitados.
5. Executar testes e aceite externo/controlado, informando limitações e dependências reais.

**Neste momento:** somente plano e registro dos requisitos. Nenhuma alteração em aplicativo, banco, segredos, conexões ou publicação antes da aprovação.
