# Saúde do sistema (Administração) + avisos por e-mail

Só o administrador da plataforma vê e configura. Nada muda em `transmissor/`, regras fiscais, API pública ou documentação.

## 1. Tela Administração › Saúde do sistema
- Volta ao menu da Administração em `/admin/saude-do-sistema` (sai da lista de telas escondidas).
- **Topo:** "Tudo funcionando" (verde), "Atenção" (âmbar) ou "Problema" (vermelho), lista do que precisa de atenção com link para o bloco, horário da última verificação (Brasília) e botão "Verificar agora".
- **Blocos:** situação, números, horário da última informação e o limite em texto ("Atenção acima de 3 s…"). Produção e homologação separadas no Governo, na Fila de webhooks e nos Erros 5xx.
- A tela mostra a última verificação guardada, então tela e e-mail sempre batem.
- Segue o novo visual do painel (claro e escuro, celular).

## De onde vem cada número

| Bloco | Origem | Precisa guardar algo novo? |
|---|---|---|
| Transmissor | `GET /` do transmissor com o mesmo acesso do painel (versão, tempo) | Sim: resultado de cada verificação, para contar "2 seguidas" |
| Governo (Sefin e ADN) | Cada chamada real que a notem já faz pelo transmissor: o transmissor já devolve o status do governo, o tempo (`ms`) e erros de conexão ou de tempo esgotado | Sim: hoje esse tempo não é guardado em lugar nenhum |
| Rotina de webhooks | `system_heartbeats` (`webhook_scheduler`) e o último registro de `webhook_scheduler_runs` | Não |
| Verificação diária | `system_heartbeats` (`nfse_daily_check` e `daily_routine`) e `nfse_daily_checks` do dia | Não |
| Fila de webhooks | `webhook_deliveries`: pendentes, atrasados (vencidos há mais de 5 min) e esgotados em 24 h | Não |
| Notas paradas | `invoices` em verificação há mais de 30 min; `invoice_fiscal_events` enviando ou em verificação há mais de 24 h, com organização e empresa | Não |
| Erros 5xx da API | `api_request_logs` com status ≥ 500 na última hora e nas últimas 24 h, todas as organizações | Não |
| Certificados | `company_certificates` ativos de empresas ativas, vencendo em até 30 dias ou vencidos | Não |

**Como o Governo é medido:**
- Sefin: emissão, consulta (DPS, nota, evento, convênio) e evento.
- ADN: distribuição.
- Conta como "respondeu" qualquer resposta do governo abaixo de 500, inclusive recusa de regra ou "não encontrada", porque o serviço está funcionando.
- Conta como falha: resposta 5xx, erro de conexão ou de certificado de segurança, e tempo esgotado.
- Se o próprio transmissor não responder, a falha vai para o bloco Transmissor, não para o Governo.
- Sem chamadas na janela: "Sem chamadas recentes" (neutro).
- Nenhuma chamada de teste ao governo.

**Limites:** todos ficam num módulo único, exatamente como na sua tabela. Detalhes que defini:
- "Erros de conexão ou tempo esgotado seguidos" = as 3 últimas chamadas daquele serviço e ambiente falharam assim.
- "Esgotados crescendo" = há mais esgotados em 24 h do que na verificação anterior.

## Tabelas novas
São três, todas só para o servidor: sem acesso de usuários e com limpeza automática de 30 dias.
- **Chamadas ao governo:** ambiente, sistema, serviço, resultado, status HTTP e tempo. Não guarda conteúdo, chave nem CNPJ.
- **Verificações:** horário, origem (agendada ou manual), situação geral e números de cada bloco.
- **Estado dos avisos:** um registro por aviso, com situação, desde quando, último e-mail e última falha de envio. Avisos resolvidos são apagados após 30 dias.

Em `platform_settings` entram duas colunas novas:
- destinatários: até 5 e-mails, validados também no banco;
- liga/desliga dos avisos, que começa desligado.

Elas não ganham leitura por usuários. A alteração passa por uma função do banco que confere o administrador e grava na auditoria (`admin_audit_events`), como o contato de suporte.

## 2. Verificação automática a cada 5 minutos
- Rota nova `/api/public/saude/verificar`, separada da rotina de webhooks. Ela recusa com 401 sem o token OIDC do Google.
- A conferência do token passa a receber o endereço esperado (audiência); a rota de webhooks continua exatamente igual.
- Sequência: consulta o transmissor, calcula cada bloco, guarda o resultado, envia os e-mails e limpa o que tiver mais de 30 dias.
- O banco impede duas verificações ao mesmo tempo.
- "Verificar agora" roda a mesma coisa, no máximo 1 vez por minuto.
- Falha no e-mail não interrompe a verificação.

**Tarefa do Cloud Scheduler.** Use a mesma região e a mesma conta de serviço da `notem-webhooks-process`. Para conferir as duas:
`gcloud scheduler jobs describe notem-webhooks-process --location=REGIAO`

```text
gcloud scheduler jobs create http notem-health-check \
  --location=REGIAO \
  --schedule="2-59/5 * * * *" --time-zone="Etc/UTC" \
  --uri="https://app.notemfiscal.com.br/api/public/saude/verificar" \
  --http-method=POST \
  --oidc-service-account-email=CONTA_DA_TAREFA_DE_WEBHOOKS \
  --oidc-token-audience="https://app.notemfiscal.com.br/api/public/saude/verificar" \
  --attempt-deadline=120s
```

O minuto 2 evita disparar junto com a virada de cada hora. A tarefa só deve ser criada depois da publicação.

## 3. Avisos por e-mail
- **Seção "Avisos por e-mail" na tela:** destinatários (até 5), liga/desliga e "Enviar e-mail de teste" (no máximo 1 por minuto).
- **Envio:** pelo Resend, de `notem <avisos@notemfiscal.com.br>`.
  - A chave `RESEND_API_KEY` será pedida pelo formulário seguro de segredos, só depois da aprovação.
  - Este projeto não tem domínio de e-mail da Lovable, então não há conflito de DNS.
- **Quando envia:**
  - quando um aviso passa para "Problema";
  - lembrete a cada 6 h enquanto continuar em "Problema";
  - "Resolvido" quando sai de "Problema";
  - "Atenção" não envia, exceto certificado vencido em empresa ativa (esse caso já é "Problema" na tabela).
- **Cada aviso é independente:** um por bloco (e por ambiente e serviço no Governo) e um por certificado. Nunca repete a cada verificação.
- **Conteúdo:**
  - assunto curto, por exemplo "[notem] Problema: transmissor não responde";
  - o que aconteceu, desde quando, organização e empresa pelo nome, e link para a tela;
  - nada de chaves, certificados, XML ou CPF/CNPJ.
- **Visual:** fundo branco e a logo fixa `https://app.notemfiscal.com.br/brand/email/notem-logo-email.png`, em português.
- **Falha no envio:** fica registrada e a tela mostra "Último aviso não enviado".
- **Avisos desligados:** os estados continuam sendo calculados. Ao religar, problemas em andamento geram e-mail na próxima verificação.

## 4. Vigia externo (Google Cloud Monitoring, você faz no Console)
1. Monitoring › Alerting › Edit notification channels › Email › adicionar seu e-mail.
2. Monitoring › Uptime checks › Create uptime check:
   - Protocolo HTTPS, tipo URL, host `app.notemfiscal.com.br`, caminho `/api/v1/status`, frequência de 1 minuto, regiões Global.
   - Validação da resposta: código aceito **401** e conteúdo contém `AUTENTICACAO_INVALIDA`.
3. Na mesma tela, criar o alerta: falha por 5 minutos, enviando para o canal de e-mail.
4. Testar com "Test" antes de salvar; o resultado esperado é 401 (aceito).

## 5. Tabela `notem_rls_probe_`
- Era uma tabela temporária de 01/11. A própria migração a criou só para provar que a proteção de linhas liga sozinha em tabelas novas, e a apagou em seguida.
- Ela não existe em nenhuma parte do banco hoje.
- Não há nada a remover e nenhuma migração será criada.

## Testes
- Situação de cada bloco nos limites: abaixo, Atenção, Problema e sem dados, incluindo "Sem chamadas recentes".
- E-mail: um por entrada em "Problema", lembrete após 6 h, "Resolvido", nada repetido; falha do Resend registrada sem travar.
- Destinatários: validação, máximo de 5, só administrador, auditoria (também no banco).
- Rota de verificação: 401 sem token, com token de outra audiência e com outra conta.
- Matriz de isolamento: usuário comum e administrador de organização não leem as 3 tabelas novas nem as colunas novas. Os testes atuais continuam passando.

## Relatório
- Origem dos números, tabelas novas, comando do Scheduler e passo a passo do vigia externo.
- Prints claro e escuro com dados fictícios, feitos numa página temporária que será apagada (com prova de 404), e print de um e-mail de aviso.
- Sem publicar.

## Ponto de atenção
O novo visual do painel ainda não foi publicado. Se esta etapa for publicada antes, ele vai junto.
