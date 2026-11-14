# Agendador interno de webhooks

Não faz parte da API v1 nem aceita chaves de integração.

- URL: `https://app.notemfiscal.com.br/api/public/webhooks/process`
- Método: **POST**, corpo vazio.
- Google Cloud Scheduler: `* * * * *`, UTC (1.440 chamadas/dia).
- Autenticação: **OIDC Google**; audiência exatamente igual à URL acima, sem parâmetros.
- Conta autorizada: `client_email` da conta já cadastrada em `GOOGLE_SERVICE_ACCOUNT_JSON`. Use essa mesma conta no campo de conta de serviço do Scheduler. Não copie sua chave privada para a tarefa.
- O servidor verifica assinatura RS256 por chaves públicas Google, emissor `accounts.google.com` ou `https://accounts.google.com`, audiência, expiração, identidade e e-mail verificado da conta autorizada.
- O responsável pela criação precisa poder usar essa conta; o agente de serviço do Cloud Scheduler precisa manter as permissões padrão para emitir OIDC.
- Sem token, token inválido ou outra conta: **401**. Não há fallback para segredo em cabeçalho.

## Prova inicial concluída
Sem OIDC: 401. Com OIDC Google real: 200; diagnóstico `req_0c386b1ec9a046cc90ee0bb33f2c11cf` registrado após retorno através de `waitUntil`.

## Processamento
O mesmo callback consulta até 5 notas por ciclo em verificação (ou envios interrompidos), sem reenviar a DPS. Após `404` persistente por 15 minutos, registra “O governo não gerou esta nota”. Erros de conexão permanecem para o próximo ciclo. O resumo inclui `invoices: {reserved, completed, failed}`. A tarefa existente e sua autenticação OIDC não mudam; use timeout de 300 segundos para lotes com consultas fiscais.
A rota definitiva aguarda o processamento de até 10 entregas vencidas por chamada, em grupos de até 3, e executa a verificação de três dias. Retorna 200 com contagens `reserved`, `completed`, `failed`, `disabled` e resumo separado de notas; falhas internas retornam 503 para permitir retry do Scheduler. Configure timeout da tarefa de 300 segundos. O banco guarda todo o estado, usa leases de reserva e protege chamadas concorrentes. Eventos reais usam `waitUntil` apenas nas rotas da API; o botão de teste aguarda envio direto e o agendador recupera pendências e leases expirados. O registro seletivo soma o trabalho de entregas e consultas fiscais.

Reenvios podem começar até cerca de um minuto após seu vencimento, além do tempo de processamento; backlog pode adicionar atraso. A tarefa deve permanecer ativa mesmo sem entregas, conforme a decisão de frequência do projeto. A tarefa é criada pelo proprietário, não pelo painel.

## Destinos
DNS público A e AAAA é verificado antes de cada tentativa usando DNS-over-HTTPS. Somente HTTPS, sem credenciais na URL, sem localhost/IPs privados, reservados ou link-local; nenhum redirect é seguido. No modelo de rede aprovado para Workers não há IP pinning nem serviço de saída separado: DNS preflight não é garantia contra rebinding entre consulta e conexão.


## Registro dos ciclos
Somente ciclos que processaram entregas ou tiveram erro são registrados, com resumo (reservadas, concluídas, falhas, desativadas). A data/hora da última execução bem-sucedida fica em um único registro (`system_heartbeats`, nome `webhook_scheduler`), para a futura tela "Saúde do sistema".
