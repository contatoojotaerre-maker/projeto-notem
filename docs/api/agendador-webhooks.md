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
A rota definitiva aguarda o processamento de até 10 entregas vencidas por chamada, em grupos de até 3, e executa a verificação de três dias. Retorna 200 com contagens `reserved`, `completed`, `disabled`; falhas internas retornam 503 para permitir retry do Scheduler. Configure timeout da tarefa de 120 segundos. O banco guarda todo o estado, usa leases de reserva e protege chamadas concorrentes. As primeiras tentativas são iniciadas pelo painel via `waitUntil`; o agendador recupera pendências e leases expirados.

Reenvios podem começar até cerca de um minuto após seu vencimento, além do tempo de processamento; backlog pode adicionar atraso. A tarefa deve permanecer ativa mesmo sem entregas, conforme a decisão de frequência do projeto. A tarefa é criada pelo proprietário, não pelo painel.

## Destinos
DNS público A e AAAA é verificado antes de cada tentativa usando DNS-over-HTTPS. Somente HTTPS, sem credenciais na URL, sem localhost/IPs privados, reservados ou link-local; nenhum redirect é seguido. No modelo de rede aprovado para Workers não há IP pinning nem serviço de saída separado: DNS preflight não é garantia contra rebinding entre consulta e conexão.
