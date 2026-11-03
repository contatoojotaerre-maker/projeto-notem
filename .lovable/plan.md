# notem — Fase 3A: Integrações, chaves e primeira rota da API

## Escopo e contrato
Implementar integrações por organização, chaves por ambiente, registro de requisições e **GET /api/v1/status**, seguindo os quatro arquivos lidos de `docs/api/`. Campos da API em português; banco e código em inglês. Preservar o padrão visual e as regras existentes. Nenhuma alteração em `transmissor/`.

Não incluir rotas de empresas, configuração fiscal, certificados ou emissão; webhooks; idempotência; página pública `/docs`; limites efetivos de uso.

## 1. Banco e permissões
Criar migração com quatro tabelas, concessões explícitas e RLS:

| Tabela | Conteúdo e garantias |
|---|---|
| `integrations` | Campos do pedido; escopo `all` ou `selected`; organização imutável; auditoria de criação/alteração. |
| `integration_companies` | Par integração/empresa único. Chaves estrangeiras compostas com `organization_id` auxiliar garantem a mesma organização. Vínculos somente no escopo `selected`; troca para `all` remove vínculos na mesma transação. |
| `integration_keys` | Campos do pedido; ambiente `sandbox`/`production`; prefixo identificador e hash único, nunca chave completa. No máximo **2 chaves ativas por integração e ambiente**, imposto atomicamente no banco, inclusive sob concorrência. Revogação preserva histórico. |
| `api_request_logs` | Campos do pedido; ID `req_` + valor aleatório; corpos já sanitizados. Organização/integração/chave/ambiente podem ser nulos em tentativas sem credencial identificável. Nunca atribuir organização pelo conteúdo enviado. |

- Membros da organização leem integrações, vínculos, metadados seguros das chaves e logs; administrador da plataforma lê globalmente. Outras organizações não têm acesso.
- Em `integration_keys`, conceder leitura autenticada **somente às colunas seguras**, excluindo `key_hash`; não conceder SELECT da tabela inteira. Aplicar RLS também a essa leitura. Hash acessível exclusivamente ao servidor, nunca ao navegador, cache de consultas ou logs.
- Escrita das quatro tabelas somente por operações do servidor; sem INSERT/UPDATE/DELETE para `anon` ou `authenticated`. Conceder acesso necessário a `service_role`.
- Criar/editar integrações, alterar escopo/empresas e gerar/revogar chaves: **owner, admin, developer** da organização e administrador da plataforma. Operator/viewer só consultam.
- Funções autenticadas verificam identidade e papel pelo cliente do usuário antes de carregar o cliente privilegiado. Operações transacionais de gestão, exclusivas do servidor, repetem a checagem de papel no banco com a identidade verificada pelo servidor. Não alterar as funções de autorização existentes.
- Índices para hash, chaves ativas, vínculos e logs por integração/organização, ambiente e data. Não apagar integrações/chaves nesta fase: desativar ou revogar.

## 2. Chaves e autenticação
- Gerar chave no servidor com aleatoriedade criptográfica (256 bits), prefixada por `ntm_homolog_` ou `ntm_prod_`; persistir hash SHA-256 da chave completa e prefixo curto de identificação.
- Retornar a chave completa somente na resposta da geração, com `Cache-Control: no-store`; exibir em diálogo temporário com copiar e **“Guarde agora; ela não será exibida novamente”**. Não salvar em armazenamento do navegador, cache de consultas, telemetria ou logs. Fechar o diálogo descarta o valor.
- Validar Bearer, formato, prefixo, hash existente, revogação e integração ativa. Confirmar consistência prefixo/ambiente armazenado. Organização, integração e ambiente vêm exclusivamente da chave.
- Chave ausente, malformada, inexistente, revogada ou integração inativa: `401 AUTENTICACAO_INVALIDA`, com a mesma mensagem pública genérica.
- Atualizar `last_used_at` de forma condicional, no máximo uma vez por minuto por chave. Revogação e desativação continuam verificadas a cada chamada, sem cache de autorização que retarde seu efeito.
- Preparar um ponto comum para limite de uso e resposta `429 LIMITE_EXCEDIDO` com `Retry-After`, mas não ativar limite nesta fase.

## 3. Rotas e respostas
API: **GET `/api/v1/status`**, TanStack server route fora do grupo de páginas autenticadas, usando apenas a chave Bearer; nenhum acesso ao governo.

Resposta 200 exatamente conforme o OpenAPI:
```json
{
  "ambiente": "homologacao",
  "organizacao": { "id": "UUID", "nome": "Nome da organização" },
  "integracao": { "id": "UUID", "nome": "Nome da integração" }
}
```

- Toda resposta da API, inclusive erros, recebe `X-Request-Id` gerado pelo servidor e JSON UTF-8. Nos erros, o mesmo identificador aparece em `id_requisicao`.
- Envelope completo da seção 6: `erro.codigo`, `mensagem`, `detalhes`, `codigo_governo`, `mensagem_governo`, além de `id_requisicao`; governo nulo nesta rota. Não devolver stack ou SQL.
- Camada comum da API trata falhas internas em JSON, evitando as páginas HTML de erro do painel. Métodos não suportados têm resposta JSON e identificador; não criar outras operações da API.

### Ponto de viabilidade a validar antes das migrações
O contrato exige `/api/v1/*`, enquanto a exceção documentada de acesso sem autenticação da hospedagem é `/api/public/*`. O painel e a API têm autenticações distintas: liberar a chamada externa não libera os dados do painel.

Validar acesso externo à URL contratada sem sessão Lovable/Supabase. A prévia atual normalmente exige acesso ao projeto, e o aplicativo ainda não foi publicado; portanto, ela não pode ser anunciada como endereço público de teste já comprovado. Não trocar o contrato para `/api/public/v1`, não adicionar alias nem publicar sem solicitação. Se a hospedagem interceptar `/api/v1/*` e não houver exceção suportada, informar o bloqueio antes de implementar o restante e aguardar decisão.

## 4. Registro seguro e retenção
- Registrar cada chamada processada pela API, inclusive 401, com contexto conhecido, método, caminho sem parâmetros secretos, status, código de erro e duração. Logs sem organização identificada ficam acessíveis somente ao administrador da plataforma.
- Sanitizador central recursivo e sem diferenciar maiúsculas: remover/mascarar `pfx_base64`, `senha`, `certificado`, credenciais, chaves, hashes e Authorization, inclusive objetos/listas aninhados e textos que contenham tokens. Nunca registrar cabeçalho Authorization, chave bruta ou corpo bruto como fallback de erro.
- Limite de **64 KB em UTF-8 por corpo sanitizado**, com indicação de truncamento e representação válida para leitura. Não copiar a requisição inteira nem persistir buffers brutos. Detalhes técnicos restritos ao log, também sanitizados.
- Gravar fora do caminho crítico apenas com mecanismo de execução em segundo plano suportado e com duração garantida (`waitUntil`); não usar promessa solta. Verificar esse suporte no ambiente hospedado. Se indisponível, aguardar uma gravação pequena e medir impacto, sem perder logs silenciosamente. Falha de gravação gera diagnóstico seguro, sem expor segredos ao cliente.
- Propor **uma limpeza diária às 03:00 UTC**, por `pg_cron`, com DELETE idempotente de registros mais antigos que 90 dias e índice de data. Uma execução por dia; remoção física pode levar até 24 horas adicionais. Consultas do painel sempre excluem registros com mais de 90 dias. Não criar verificações frequentes ou várias tarefas de limpeza.
- Preparar o filtro de empresa sem inferir identidade a partir do corpo: nesta fase `/status` não tem empresa. Habilitar esse filtro quando rotas futuras tiverem empresa validada.

## 5. Telas do painel
Substituir “Em breve” no menu **Integrações**, sem alterar outras seções.

- **Lista:** nome, situação, todas/selecionadas, último uso e contagem de chaves ativas em Homologação e Produção. Estado vazio e ações conforme papel.
- **Nova integração:** nome, descrição, Todas as empresas / Empresas selecionadas, busca e seleção de empresas da organização. Escopo selecionado exige ao menos uma empresa.
- **Detalhe:** editar nome/descrição e ativar/desativar; abas solicitadas:
  - **Chaves:** ambientes separados; gerar, copiar uma vez, listar prefixo/criação/último uso e revogar com confirmação. Ao atingir duas ativas, impedir terceira sem revogar; segunda chave permite troca sem interrupção.
  - **Empresas autorizadas:** visualizar/editar escopo e seleção, somente empresas da organização.
  - **Requisições:** últimos 90 dias, filtros por período/ambiente/status/somente erros, paginação; detalhe com método, rota, status, duração, ID, corpos formatados e copiar conteúdo sanitizado.
  - **Como testar:** curl para `/api/v1/status`, com endereço do painel identificado corretamente e marcador para substituir pela chave completa; prefixo visível apenas para identificação, nunca apresentado como credencial funcional.
- Operator/viewer veem dados e requisições, sem ações de gestão. Estados de carregamento, vazio, erro e somente leitura seguem o padrão existente.

## 6. Detalhes técnicos e documentação
- Páginas protegidas: `/o/$orgSlug/integracoes` e `/o/$orgSlug/integracoes/$integrationId`; criação em diálogo da lista. Garantir que a rota genérica atual não mantenha o conteúdo “Em breve” para esta seção.
- Reutilizar middleware autenticado, funções de servidor e opções de consulta carregadas pelas páginas; separar gestão do painel, autenticação da API e sanitização. Identificação de organização sempre validada, nunca confiada ao navegador.
- Atualizar `docs/api/openapi.yaml` no mesmo trabalho: resposta `/status`, exemplos, cabeçalho também no 401, envelope de erro e servidor real quando confirmado. Preservar a base contratada e distinguir prévia restrita de URL pública.
- Atualizar convenções/glossário para explicitar até duas chaves por ambiente durante rotação e que nenhum limite está ativo na Fase 3A; não mudar contratos das fases futuras.
- Registrar em `AGENTS.md`: **“Toda rota nova ou alterada da API deve atualizar docs/api/ no mesmo trabalho. A página pública /docs (fase final) será gerada a partir de docs/api/.”** Registrar as novas fronteiras de segurança em inglês.
- Manter `/docs` no roadmap da fase final; títulos e descrições próprios nas novas páginas.

## 7. Testes e aceite
1. Chaves distintas, prefixos/ambientes corretos, hash verificável e ausência de texto secreto persistido. Terceira chave recusada, também com geração simultânea; após revogação, permitir substituta.
2. Chaves ausentes/malformadas/inexistentes/revogadas e integração inativa → 401 no envelope exato; `X-Request-Id` em sucesso, erros e falhas internas.
3. `/status` com ambas as chaves retorna organização/integração corretas e ambiente conforme OpenAPI, sem aceitar organização ou ambiente enviados pelo cliente.
4. Isolamento entre organizações; empresa estrangeira recusada no banco; vínculos incompatíveis com escopo recusados. Verificar leituras seguras e recusa de acesso direto ao hash.
5. Cada papel: owner/admin/developer e administrador global gerenciam; operator/viewer apenas leem; anônimo não acessa tabelas nem operações de gestão.
6. Sanitização aninhada, maiúsculas, tokens em texto, UTF-8 e truncamento de 64 KB; logs de sucesso/401 sem segredos. Retenção de 90 dias, limpeza diária e atualização leve de último uso.
7. Testes locais e de banco com rollback para regras; regressões do painel. Medir gravação de logs e concorrência quando houver conexão apropriada.
8. Fluxo real: criar integração → gerar chave → chamar `/status` → ver requisição → revogar → confirmar 401 e nova requisição. Não anunciar fluxo verificado se faltar sessão ou acesso externo; Supabase externo não dispõe de sessão gerenciada de teste.

## Ordem de execução após aprovação
1. Validar acesso à URL `/api/v1/status` e mecanismo confiável de logs no ambiente hospedado, sem alterar contrato.
2. Aplicar tabelas, grants, RLS, restrições, operações transacionais e limpeza diária.
3. Implementar autenticação comum, sanitização, logs e `/status`; atualizar documentação no mesmo trabalho.
4. Implementar lista/detalhe e ações protegidas do painel.
5. Executar testes, conferir fluxo conectado quando possível e informar claramente qualquer validação pendente.

**Até a aprovação:** somente planejamento e registro dos requisitos; nenhum código do aplicativo, tabela, chave ou configuração de hospedagem alterado.
