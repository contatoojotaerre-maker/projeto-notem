# PIS/COFINS por empresa, tratamento de indisponibilidade e integração VistoCash

## Escopo e sequência

1. Implementar **A — PIS/COFINS** e **B — tratamento do incidente na notem**, com testes e documentação.
2. Implementar o **link de PDF de 30 dias** e os **limites exclusivos da VistoCash** conforme as propostas abaixo.
3. Investigar certificado da matriz para filiais e entregar uma proposta separada, sem flexibilizar a validação atual.
4. Entregar relatório com verificado/não verificado e aguardar autorização para publicar. Nenhuma emissão real, envio de certificado ou alteração de notas existentes faz parte da verificação deste plano.

**Limite obrigatório:** não criar, editar, mover ou apagar arquivos em `transmissor/`, nem publicar o serviço Google Cloud Run. A parte B que exige mudanças nesse serviço será entregue como especificação para seu responsável executar fora deste projeto; não ficará declarada como implementada pela notem.

## A. PIS/COFINS opcional por empresa

### Comportamento
- Acrescentar à configuração fiscal da empresa o objeto opcional `pis_cofins: { cst, tipo_retencao }`.
- Primeira versão aceita **somente** `cst: "99"` e `tipo_retencao: "0"`, ambos como texto.
- Outra combinação, inclusive configuração parcial, retorna **422 `REGRA_DE_NEGOCIO`**, com campo correspondente e mensagem exata **"combinação de PIS/COFINS ainda não suportada"**. JSON inválido continua 400.
- Ausência ou `null`: sem configuração, sem `tribFed`. No PUT, que substitui a configuração fiscal, ausência/null também remove uma configuração anterior; documentar expressamente esse comportamento.
- No painel, opção desligada por padrão; quando ativada, mostrar apenas “99 — Outras Operações” e “0 — PIS/COFINS/CSLL não retidos”, sem sugerir essa escolha automaticamente para todas as empresas. Decisão fiscal continua sendo da empresa com seu contador.
- Com configuração válida, escrever exatamente entre `tribMun` e `totTrib`:

```xml
<tribFed><piscofins><CST>99</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>
```

- Não incluir base, alíquotas, valores monetários ou retenções adicionais; não confundir esse CST com IBS/CBS.
- Guardar a configuração no retrato fiscal e na entrada de montagem da nota. Reenvio/reconciliação conserva o retrato, mesmo que a empresa seja editada depois.
- Notas existentes, XML oficiais e PDFs históricos permanecem intactos; dados antigos sem os campos continuam válidos.

### Documentação
- Atualizar configuração fiscal, OpenAPI, guia fiscal, emissão e histórico da API, com exemplos fictícios.
- Explicitar a correspondência pública: `dentro_do_simples → 1`, `iss_fora_do_simples → 2`, `tudo_fora_do_simples → 3`; `me_epp → opSimpNac 3`; `nenhum → regEspTrib 0`.
- Explicar omissão, remoção, suporte limitado a 99/0 e recusa 422, sem alterar os demais regimes.

## B. Tratamento do incidente

### Na notem
- Criar uma classificação compartilhada de falhas: resposta HTTP 500/503 do serviço de transmissão, conexão, tempo esgotado, identificação do painel e resposta inválida. Usar apenas códigos internos fixos, nunca texto bruto de exceções.
- API: quando a operação falhar por indisponibilidade confirmada desse serviço, retornar **503 `SERVICO_FISCAL_INDISPONIVEL`**, no envelope existente e com `X-Request-Id`. Mensagem pública: **"O serviço fiscal está indisponível. Tente novamente em instantes."**
- Preservar recusas fiscais e de certificado em 422, erros não relacionados em 500 e indisponibilidade do governo com seu código existente.
- **Segurança da emissão:** 500/503 ou timeout não prova, sozinho, que nada foi enviado. Quando houver possibilidade de envio, manter **202 e reconciliação**, sem retransmitir nem criar outra nota. O novo 503 não substitui estados ambíguos. Só afirmar “não enviado” com evidência segura.
- Aplicar a classificação aos caminhos irmãos: certificado, convênio, emissão, consultas, eventos e ADN, respeitando o contrato próprio de cada operação.
- No envio de certificado, mensagens de indisponibilidade/erro não mencionarão `Idempotency-Key`. Não remover a regra de idempotência da API ou a orientação necessária aos reenvios de emissão.
- Acrescentar `internal_reason` a `api_request_logs`: valores fixos como `TRANSMISSOR_HTTP_500`, `TRANSMISSOR_HTTP_503`, `TRANSMISSOR_TIMEOUT`, `TRANSMISSOR_AUTH_FAILED`. Nunca guardar corpo do serviço, senha, envelope, token ou stack trace.
- Motivo técnico acessível apenas à administração da plataforma; não incluir em respostas ou leituras de parceiros/membros comuns. Registrar também nas respostas 202 originadas por falha, quando o contexto da requisição existir.
- Falha ao gravar logs não altera o resultado fiscal nem bloqueia o atendimento; preservar o mecanismo atual de gravação pós-resposta e seu fallback.
- Documentação pública explica o código e como reagir, sem expor nomes de infraestrutura.

### Serviço de transmissão — entrega para o responsável
- Especificar tratamento de exceções inesperadas com JSON e código fixo `ERRO_INTERNO_TRANSMISSOR`, status 500, sem exceções na resposta.
- Preservar recusas de negócio já tratadas, status HTTP corretos e logs técnicos sanitizados.
- Diferenciar falha anterior ao envio de falha posterior/ambígua; não usar o código genérico como prova de que não houve transmissão.
- Validar a compatibilidade da notem com respostas simuladas; confirmação do serviço real depende da execução e publicação pelo responsável. Não alterar `transmissor/`.

## C1. Certificado da matriz para filiais — investigação, não implementação
- Conferir regras oficiais de assinatura, mTLS, emissão, eventos e ADN: igualdade dos 14 caracteres versus raiz de CNPJ; incluir CNPJ alfanumérico, sem comparação que descarte letras.
- Mapear verificações no preparo do certificado, banco, prontidão, uso do envelope e prova de posse das notas recebidas.
- Avaliar separadamente cada operação: mesma raiz não será considerada autorização universal.
- Entregar fontes e proposta de guarda/reutilização por filial com isolamento por organização, identificação do titular e auditoria; explicar mudanças necessárias no serviço externo.
- Sem certificado real, sem chamada fiscal e sem flexibilizar CNPJ ou prova de posse. A implementação aguarda novo plano/aprovação após as evidências.

## C2. Link público do PDF por 30 dias
- Criar link mediante chamada autenticada pela integração, para nota própria e situação já permitida pelo PDF atual. Proposta: `POST /api/v1/notas/{id}/links-pdf`; devolver URL e `expira_em`, com idempotência nas condições do contrato existente.
- Token aleatório de alta entropia, válido por **30 × 24 horas** desde a criação; guardar apenas hash, organização, nota, ambiente, integração, criação, expiração e revogação em tabela privada. Token não contém chave API ou dados fiscais.
- Link público sob o domínio oficial app, em `/api/public/arquivos/pdf/{token}`; gerar o PDF sob demanda com o mesmo renderizador e sem exigir certificado vigente. Não criar cópia no Storage nem expor URL assinada do bucket.
- Quem tiver o link poderá acessar o documento até expirar/revogar: é um acesso por posse do link, não uma identificação do destinatário.
- Revogação autenticada por ID do link, com escopo da organização; expiração exata e recusa neutra para token inválido, expirado ou revogado. Sem XML e sem ampliar acesso a notas recebidas/externas nesta versão.
- Verificar autorização e estado da nota na criação; verificar vínculo, validade e permissão de PDF novamente no download. Não reutilizar regras de uma organização para outra.
- `no-store`, `noindex`, `Referrer-Policy: no-referrer`, sem redirecionamentos externos; não registrar token bruto em logs da aplicação, corpos de resposta ou caminho persistido. Verificar também o que é controlável nos registros da hospedagem e informar limitações.
- Limites próprios por endereço de acesso e por organização, além de concorrência de geração; token público não significa download ilimitado. Reutilizar a política compartilhada sem transformar a rota pública em uma rota autenticada por chave.
- Limpeza só dos registros de links vencidos/revogados, sem apagar notas ou XML fiscais. Documentar criação, revogação, expiração e responsabilidade por compartilhar a URL; não acrescentar link público automaticamente aos webhooks atuais.

## C3. Limites exclusivos da VistoCash

Proposta inicial conservadora dentro da faixa pedida:

| Regra | Proposta |
|---|---:|
| PDF por chave/ambiente | **60/minuto** |
| Geral por chave/ambiente | **600/minuto** |
| Teto geral da organização por ambiente | **600/minuto** |
| Rajada geral por chave/ambiente | **100/10 segundos** |
| Geração simultânea de PDF | **2**, sem mudança |

- O ajuste da rajada evita que os atuais 30/10 s impeçam o uso sustentado de 600/min; limites específicos de emissão, eventos, XML e certificados permanecem iguais.
- Aplicar overrides somente ao ID confirmado da organização VistoCash, preservando padrões de todas as demais organizações e overrides não relacionados. A estrutura atual aplica overrides nos dois ambientes; deixar isso explícito no relatório.
- Começar em 60 PDFs/min; 120/min fica para ajuste posterior com medições. Aumentar teto não garante capacidade/latência; concorrência 2 continua podendo produzir 429.
- Auditar valores antigos/novos e manter 429 com `Retry-After`. Não fazer carga com emissão real.

## Detalhes técnicos
- **A:** `fiscal.ts`, `api-contract.ts`, formulários/servidores fiscais, `dps.ts`, montagem em `api-invoices.server.ts`, retratos e migração de `company_fiscal_settings`.
- **B:** `transmissor.server.ts`, classificadores compartilhados, `api.server.ts`, caminhos de certificados/notas/eventos/ADN e migração de `api_request_logs`. Coluna interna exige revisão de grants e consultas, não apenas ocultação visual.
- **C2:** módulo próprio de links, rotas de criação/revogação pela API compartilhada, rota pública verificando token dentro do handler, tabela privada e política de limites. Nenhuma chave/material de certificado entra no fluxo público.
- **C3:** reutilizar `api_rate_limit_overrides` e `api-policy.ts`; não mudar padrões globais.
- Migrações preservam RLS, isolamento e permissões por coluna; novas tabelas revogam grants herdados antes de conceder apenas os necessários. Atualizar contratos e notas de arquitetura junto da execução.

## Testes e critérios de entrega
- PIS/COFINS: omissão; XML 99/0 na ordem correta; toda outra combinação/pares incompletos em 422; remoção; retrato imutável; nenhuma mudança nas matrizes fiscais anteriores. Validar XML localmente contra os XSD aplicáveis, sem transmissão.
- Incidente: 500/503, falhas de conexão/identificação/timeout e JSON inválido simulados; 503 com código próprio onde seguro; 202 nos casos ambíguos; nenhum reenvio cego; certificado sem orientação de Idempotency-Key; motivo técnico fixo privado; falha de log não muda resultado.
- Links: expiração de 30 dias, revogação, token/hash, isolamento A/B, ambientes, estados de nota, limites, concorrência e ausência de token nos logs; leitura do PDF pela URL em fluxo autorizado com dados de teste, sem emissão real.
- VistoCash: valores concretos dos overrides e isolamento das demais organizações; 429/Retry-After com respostas simuladas, sem carga fiscal.
- Rodar testes focados e regressões, validação OpenAPI/exemplos, matriz de isolamento e conferir o resultado da prévia. Fluxos reais só serão declarados verificados quando houver acesso e evidência; caso contrário, marcar **não verificado**.
- Relatório final identifica migrações, contratos, valores aplicados, dependência externa do transmissor e investigação pendente. **Não publicar sem sua aprovação.**