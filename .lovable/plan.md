# notem — Fase 2A: Certificado digital e conexão com o governo

## Escopo e condição de execução
Guardar com segurança o certificado A1 de cada empresa e consultar seu convênio municipal no ambiente selecionado. Sem DPS, assinatura fiscal, emissão, cancelamento ou outras consultas.

**Não aplicar antes da aprovação. A aprovação deste plano não autoriza infraestrutura adicional.** A conexão mTLS dinâmica precisa ser comprovada no ambiente escolhido antes de implementar a integração completa. Se não for viável, interromper essa parte e submeter a decisão ao usuário, sem propor serviço externo automaticamente.

## 1. Viabilidade e bloqueios confirmados
- Deno documenta `Deno.createHttpClient({ cert, key })` e `fetch(url, { client })`, com PEM carregado em execução. O Supabase incorporou a exposição da API em março de 2025, mas não foi feito teste no ambiente hospedado deste projeto. **Suporte efetivo e handshake mTLS: ainda não confirmados.**
- O servidor atual da notem executa em Cloudflare Workers, não em Supabase Edge Functions. O mecanismo documentado de mTLS usa bindings configurados previamente; não comprova o uso dinâmico dos certificados enviados por cada empresa. Não substituir o modelo atual nem criar Edge Functions nesta aprovação sem resolver expressamente essa escolha.
- `node-forge`: candidata em JavaScript para PKCS#12, sujeita a prova no runtime escolhido com senha, chave privada, cadeia e algoritmos dos arquivos A1.
- `xmldsigjs`: candidata Web Crypto para XMLDSig na Fase 2B; compatibilidade com o runtime e o perfil DPS ainda não comprovada. Não implementar assinatura nesta fase.
- Portal oficial confirma os endereços de documentação: homologação `https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html`; produção `https://adn.nfse.gov.br/parametrizacao/docs/index.html`.
- O Swagger mencionado não está entre os anexos disponíveis. A tentativa de acesso aos dois ambientes falhou na negociação HTTPS, o que não prova a causa nem a exigência de mTLS. Confirmar a operação exata, resposta e autenticação pelo Swagger oficial antes de codificar. Há divergência entre o caminho do brief e o descrito em manual; não escolher por suposição.

### Fontes
- [Deno — createHttpClient](https://docs.deno.com/api/deno/~/Deno.createHttpClient)
- [Supabase — exposição da API, PR 515](https://github.com/supabase/edge-runtime/pull/515)
- [Supabase — histórico do problema, issue 208](https://github.com/supabase/edge-runtime/issues/208)
- [Cloudflare — mTLS bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/)
- [node-forge — PKCS#12](https://github.com/digitalbazaar/forge#pkcs12)
- [xmldsigjs](https://github.com/PeculiarVentures/xmldsigjs)
- [NFS-e — APIs oficiais](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)

## 2. Correção prévia: auditoria de autorização
A consulta ao banco real identificou as seis funções executáveis por usuários autenticados. **Nenhuma recebe ID de usuário fornecido pelo chamador.** Não há aquela correção de assinatura a aplicar; preservar os caminhos atuais e provar a regra com testes.

| Função | Situação atual e ação planejada |
|---|---|
| `is_platform_admin()` | Consulta exclusivamente `auth.uid()`; manter e testar isolamento. |
| `is_org_member(org_id)` | ID recebido é da organização; usuário vem de `auth.uid()`; manter e testar. |
| `has_org_role(org_id, roles)` | Papéis avaliados somente para `auth.uid()`; manter e testar. |
| `pending_invitations()` | Usa e-mail confirmado do usuário da sessão; manter e testar. |
| `accept_invitation(invitation_id)` | Confere sessão, método autenticado e e-mail antes do aceite atômico; manter e testar. |
| `organization_team(org_id)` | Confere administrador global ou owner/admin da organização antes de listar; preservar listagem autorizada e testar recusa fora desse escopo. |

- Revisar dependências nas políticas e todas as sobrecargas antes de qualquer migração; não adicionar parâmetro de usuário.
- Manter `EXECUTE` necessário para RLS e RPC autenticadas; não revogar indiscriminadamente nem trocar por invoker causando recursão ou exposição de `auth.users`.
- Hoje anon não executa nenhuma das seis; as oito tabelas públicas têm RLS ativo. Os seis avisos genéricos podem permanecer por uso intencional de SECURITY DEFINER. Não prometer seu desaparecimento.
- Entregar relatório por função: o que foi mantido, eventual ajuste justificado e teste correspondente.

## 3. Prova técnica antes da integração
Depois da aprovação e resolução do ambiente de execução:
1. Confirmar no ambiente publicado a disponibilidade da API de mTLS, não apenas localmente.
2. Exercitar PKCS#12 com certificado de teste, sem material em logs; validar cadeia/chave e extrair o CNPJ do OID ICP-Brasil `2.16.76.1.3.3` na extensão apropriada.
3. Confirmar pelo Swagger oficial caminho, códigos HTTP, campos de convênio e autenticação.
4. Com certificado real enviado pelo formulário seguro, comprovar handshake e resposta real em homologação.
5. Em caso de falha ou suporte incerto, parar e apresentar evidência ao usuário. Não acrescentar serviços nem enfraquecer a verificação TLS.

## 4. Guarda proposta
**Proposta: tabela de material cifrado acessível somente ao servidor, separada de metadados.** Não usar Vault: a chave exigida precisa ficar fora do banco. Não usar Storage neste escopo: pequenos arquivos A1 podem ser guardados como envelope cifrado no banco sem expor URLs de arquivo.

- Criptografia autenticada AES-256-GCM com nonce aleatório por operação; cifrar PFX e senha no mesmo envelope, associando empresa, organização, certificado e versão como dados autenticados.
- Chave externa ao banco, em segredo de servidor, identificada por versão. Provisionar somente após aprovação, sem expor o valor. Definir tamanho/formato apropriado da chave com o mecanismo seguro de geração.
- Metadados separados: titular, CNPJ, emissor, serial, início/fim da validade, autor e datas. Somente os dados necessários chegam à tela.
- Tabela de material: sem privilégios para anon/authenticated, RLS ativo sem políticas de acesso desses papéis. Acesso privilegiado somente depois de autenticar e autorizar a empresa na sessão.
- Um ativo por empresa, independentemente do ambiente. Troca atômica: registrar novo, apagar material anterior e manter somente metadados históricos. Se o novo falhar, preservar o ativo anterior.
- A versão permite futura rotação: manter temporariamente a chave antiga para recifrar registros, verificar conclusão e só depois removê-la. Não implementar administração de rotação agora.
- Exclusão vale para o material ativo na aplicação; cópias de segurança podem reter envelopes cifrados conforme a política de retenção do Supabase. Não prometer apagamento imediato de backups.

## 5. Aba Certificado
- Enviar `.pfx`/`.p12` e senha apenas por owner/admin da organização ou administrador da plataforma; repetir autorização no servidor.
- Enviar diretamente ao servidor autenticado por HTTPS, sem localStorage, sessionStorage, IndexedDB, cache de consulta, analytics ou logs contendo arquivo/senha. Limpar seleção e senha após finalizar ou cancelar.
- Recusar senha incorreta, arquivo inválido, ausência de chave privada, validade ainda não iniciada, certificado vencido e CNPJ diferente do cadastro. Parser define formatos e limite de tamanho após prova técnica.
- Mostrar titular, CNPJ, emissor e validade. Situações: Válido, Vence em X dias (âmbar com 30 dias ou menos), Vencido.
- Botão Substituir certificado; histórico só com metadados. Demais membros autorizados a visualizar a empresa podem ver metadados, nunca o material.
- Auditar envio, substituição e cada tentativa de uso: usuário, horário, empresa, finalidade, ambiente quando aplicável e resultado, nunca segredos.

## 6. Aba Prontidão — convênio municipal
- Primeiro item: consulta do convênio pelo município cadastrado e ambiente salvo no painel; botão Verificar novamente.
- A ação exige owner/admin ou administrador da plataforma nesta fase, por envolver uso do certificado; demais membros leem os resultados autorizados, sem novo poder de uso do material.
- Mostrar aderência ao emissor nacional, situação de emissão padrão dos contribuintes e data, usando os campos confirmados no Swagger.
- Guardar a resposta completa: status HTTP, corpo, data e ambiente, com escopo da organização/empresa. Separar resultados de homologação e produção; troca de ambiente nunca apresenta resposta do outro como atual.
- Detalhes técnicos: resposta governamental e diagnóstico sanitizado. Nunca incluir senha, PFX, PEM de chave, cabeçalhos de autenticação ou rastros que contenham material sensível.
- Traduzir erros em português: certificado recusado, município não encontrado, governo indisponível; usar classificação técnica confirmada, não supor que todo erro TLS significa certificado recusado.
- Timeout e controle de repetição; a consulta é somente leitura no governo. Falhas também ficam registradas sem substituir um resultado bem-sucedido por aparência de sucesso.

## Detalhes técnicos
- Preservar TanStack server functions autenticadas como fronteira do painel; qualquer exceção de execução para mTLS depende de decisão expressa, com identificação da sessão e autorização tenant antes da leitura privilegiada.
- Proposta de entidades: `company_certificates` (metadados/histórico), `company_certificate_material` (envelope atual), `certificate_audit_events` e `municipality_agreement_queries` (respostas por ambiente).
- Todas as novas tabelas públicas: grants explícitos alinhados à função, RLS e relações por empresa/organização; índice único para certificado ativo. Nenhuma política do navegador permite ler material cifrado.
- Transação autenticada, com privilégio mínimo, para troca de certificado, descarte do anterior e auditoria; bloquear condições de corrida. Não abrir RPC privilegiada que aceite material sem verificar papel e empresa.
- Criar módulos pequenos para validação PKCS#12, criptografia, consulta municipal e abas; bibliotecas sensíveis carregadas somente dentro da fronteira de servidor. Registrar arquitetura em AGENTS.md após implementação aprovada.
- Preservar marca, temas, rotas públicas, papéis e regras já aprovados. Nenhuma mudança nas demais abas.

## Validações e conclusão
- Testes de regras: owner/admin/global autorizado; operator/viewer/developer sem envio/uso; acesso entre organizações negado; funções baseadas na sessão; criptografia com chave/nonce incorretos recusada; troca preserva só histórico e um ativo.
- Casos de certificado: senha errada, arquivo inválido, sem chave, CNPJ divergente, vencido, início futuro; limites de 30 e 31 dias; metadados corretos.
- Verificar ausência de material em respostas, persistência do navegador, logs e detalhes; permissões de leitura de material negadas a anon/authenticated.
- Verificar telas em desktop e celular e fluxo autenticado real. Supabase externo não oferece sessão gerenciada de teste: se necessário, o usuário executa a sessão real sem compartilhar credenciais no chat.
- **Aceite obrigatório:** A1 da empresa do Grupo Jota em Passo de Torres/SC, IBGE `4212254`; titular/CNPJ/validade corretos; consulta de homologação com resposta real exibida e lida novamente dos detalhes técnicos. Simulação ou compilação não satisfazem este aceite.
- Entregar relatório com resultado das seis funções, grants/RLS, viabilidade comprovada, consulta governamental e limitações. Se faltar ambiente viável, Swagger ou certificado real, declarar o bloqueio, não marcar a fase concluída.
