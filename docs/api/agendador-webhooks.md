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

## Prova inicial
Antes do motor definitivo, a chamada autorizada verifica `waitUntil` e registra somente diagnóstico sanitizado em `api_request_logs`, retornando identificador, modo de execução e autenticação. Falta de execução em segundo plano retorna 503. Nenhuma entrega é disparada nesta prova.

## Processamento previsto
O agendador somente acorda lotes limitados de entregas vencidas e verificações de três dias. O banco guarda todo o estado e protege reservas concorrentes. Reenvios podem começar até cerca de um minuto após seu vencimento, além do tempo de processamento; backlog pode adicionar atraso. A tarefa deve permanecer ativa mesmo sem entregas, conforme a decisão de frequência do projeto.