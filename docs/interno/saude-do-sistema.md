# Saúde do sistema (Administração)

Tela só para administradores da plataforma: `/admin/saude-do-sistema`. Mostra oito blocos (transmissor, governo Sefin/ADN, rotina de webhooks, verificação diária, fila de webhooks, notas paradas, erros 5xx da API, certificados), cada um com situação, limites e "Última informação". Os limites ficam só em `src/lib/health-policy.ts`.

## Verificação automática
- URL: `https://app.notemfiscal.com.br/api/public/saude/verificar`
- Método: **POST**, corpo vazio. Cloud Scheduler: `*/5 * * * *` (UTC), timeout de 60 s.
- Autenticação: **OIDC Google**, audiência exatamente igual à URL acima, mesma conta de serviço da tarefa dos webhooks (`GOOGLE_SERVICE_ACCOUNT_JSON`). É uma tarefa **separada** da tarefa de webhooks.
- Sem token, token inválido ou outra conta: 401. Respostas sem cache e com noindex.
- "Verificar agora" na tela usa a mesma rotina; execuções simultâneas são bloqueadas no banco.
- Resultado guardado em `health_checks` (só servidor); limpeza automática de dados antigos.

## Vigia externo (Google Cloud Monitoring)
- URL: `https://app.notemfiscal.com.br/api/public/saude/ping` — GET, sem login.
- 200 `{"status":"ok"}` se a última verificação automática tiver menos de 15 min; 503 `{"status":"verificacao_atrasada"}` se tiver mais. Nenhum outro detalhe. Sem cache, noindex, não grava em `api_request_logs`.
- Monitoring → Uptime checks → Create: protocolo HTTPS, host `app.notemfiscal.com.br`, caminho `/api/public/saude/ping`, frequência **5 minutos**, código aceito **200** (Response code classes: só 2xx — ou código específico 200).
- Política de alerta: condição de falha do uptime check com **2 falhas seguidas** (duração de 10 min / 2 períodos), canal de e-mail do responsável.
- Assim o vigia avisa se a notem cair **e** se a verificação interna parar.

## Medição das chamadas ao governo
Cada resposta do transmissor gera uma amostra (sistema, serviço, ambiente, resultado, código HTTP, duração) em `government_calls`, gravada **depois** da resposta (`waitUntil`). Falha na gravação é descartada com registro interno `GOV_CALL_RECORD_FAILED`; nunca atrasa nem quebra emissão, consulta ou evento (teste em `src/test/government-calls.test.ts`). Não guarda XML, CNPJ, chave nem corpo.

## Avisos por e-mail
- Começam **desligados**. Até 5 destinatários, gravados com trilha de auditoria.
- Envio pelo Resend (`RESEND_API_KEY`), remetente `notem <avisos@notemfiscal.com.br>`.
- E-mail quando algo entra em Problema, lembrete a cada 6 h enquanto continuar, e quando resolver. Atenção não gera e-mail. Sem dados sensíveis (só nomes, datas e contagens).
- Falha de envio aparece na tela e não interrompe a verificação.
