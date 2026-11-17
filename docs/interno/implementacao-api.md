# Notas internas de implementação da API

Este documento não integra o contrato público nem a futura página `/docs`. Os trechos abaixo preservam detalhes operacionais retirados da documentação pública durante a auditoria.

## Registro e retenção
Os registros são sanitizados, limitados a 64 KB por corpo e removidos automaticamente após 90 dias por tarefa SQL diária às 03:00 UTC. A gravação usa `waitUntil` quando disponibilizado pela requisição; caso contrário, é aguardada antes da resposta. O cabeçalho `Server-Timing` identifica o modo e, no modo síncrono, o tempo da gravação. `waitUntil` confirmado na publicação: resposta com `api-log;desc="background"` e registro correspondente confirmado no banco. Não há espera síncrona pela gravação no ambiente hospedado validado.


## Emissão e DANFSe
Partes 1–5: API de tomadores, montagem/leitura XML, emissão idempotente, consulta automática e painel somente leitura. E2 adiciona DANFSe sob demanda. Operações de cancelamento/substituição e emissão IBS/CBS continuam fora desta etapa.
O identificador DPS usa tipo de inscrição **2 para CNPJ**, conforme o Anexo I v1.01. Série e número são definitivos. Tomador estrangeiro não implica exportação: operações que exijam grupos fiscais fora de E1 serão recusadas antes da reserva, sem omitir dados obrigatórios.

## Consulta automática e segurança de repetição
- O agendador existente consulta lotes limitados de notas em verificação, com reservas temporárias no banco para impedir concorrência. Tentativas interrompidas após o início do envio também entram em consulta.
- Após um minuto, consulta o identificador DPS; com chave encontrada, consulta o XML da NFS-e. Somente `404` depois de 15 minutos desde o início da tentativa permite rejeitar como **“O governo não gerou esta nota”**. Erro de conexão ou XML não confirmado permanece em verificação.
- Falhas comprovadas de autenticação do Google ou validação própria anterior à transmissão permitem repetir a mesma DPS/número. Timeout e demais falhas ambíguas nunca autorizam retransmissão automática.
- Autorização/rejeição e criação dos webhooks são confirmadas na mesma operação do banco. Sem execução em segundo plano, os eventos ficam na fila durável do agendador.
- `consulta_publica`: `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave_acesso}` quando existe chave válida; caso contrário `null`. XML/PDF exigem chave; outra organização ou ambiente responde `404`.

## DANFSe v2.0 (E2)
PDF gerado somente a partir do XML autorizado armazenado, sem completar dados pelos cadastros atuais; ausentes = `-`. Situação atual determina marca d'água CANCELADA/SUBSTITUÍDA. Homologação mostra NFS-e SEM VALIDADE JURÍDICA. Não há PDF persistido nem cache definitivo. A opção `imprimir_canhoto_danfse` da configuração fiscal é false por padrão.
O QR e o objeto nota usam a mesma URL de consulta pública. PIS/COFINS de apuração própria aparece apenas até competência 31/12/2026. Informações complementares preservam os tributos aproximados informados no XML. Sem valores IBS/CBS, os respectivos campos permanecem `-`.

## Numeração e DPS existente (E0014)
Novas séries automáticas começam em 900 e avançam até 49999 por CNPJ; séries e contadores existentes são preservados.
Somente resposta explícita de envio HTTP 400 contendo exclusivamente E0014 permite salto. O número é registrado como usado externamente, nunca reaproveitado. A mesma nota, Idempotency-Key e dados congelados recebem o próximo número, com nova DPS assinada pelo transmissor existente.
Até cinco saltos além do envio inicial (máximo seis envios com números diferentes), com contador persistente e histórico de cada número/identificador/XML/resposta. Repetir a chave não reinicia o limite. Não há webhook de rejeição intermediária.
Se a espera da API estiver acabando, retorna 202 e continua no agendador. Respostas ambíguas, conexões interrompidas e DPS encontrada na consulta nunca autorizam salto: consultam o número atual. Outros códigos, ou erros mistos, seguem rejeição normal. Limite ou numeração esgotada termina em rejeição com orientação em português.


## Classificação de falhas anteriores ao envio
 DNS/conexão recusada antes de chegar ao transmissor, 401/403 do Google antes do serviço ou 4xx de validação própria com código (ex.: DPS_INVALIDA, ENVELOPE_INVALIDO). A repetição usa a mesma DPS e número. Qualquer situação ambígua vai para verificação. 403 do governo, diferente do Google, rejeita por certificado e reavalia a empresa.

## Webhooks de notas
`nota.autorizada` e `nota.rejeitada` enviam em `dados` o objeto completo de nota descrito em `docs/api/guias/ciclo-de-vida.md`, sem XML, certificado ou senha. A mudança de situação e os eventos são gravados atomicamente, inclusive quando o resultado vem de consulta automática. Cada endereço respeita organização, ambiente, grupo/tipo e filtro por empresa. Apenas as rotas de API iniciam tentativa imediata via `waitUntil`; sem ele, os eventos permanecem na fila do agendador. Confirme o estado por `GET /notas/{id}`.
