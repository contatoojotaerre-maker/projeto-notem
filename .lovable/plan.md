# Auditoria da documentação pública da API

## Escopo
Corrigir documentação e acrescentar validação automática, sem alterar comportamento, rotas, respostas, banco ou painel da API. Não tocar em `transmissor/`. Aplicar somente após aprovação; esta solicitação não inclui publicação.

## 1. Corrigir e validar o OpenAPI
- Colocar entre aspas todas as descrições de uma linha, inclusive dentro de objetos YAML em linha; manter descrições multilinha válidas.
- Corrigir os casos identificados: `POST /notas` respostas 409/422 e `DELETE /empresas/{id}` resposta 204. Além de quebrar a descrição, vírgulas em objetos em linha podem criar propriedades indevidas; conferir e eliminar esse efeito.
- Executar um validador **OpenAPI 3.1**, não apenas um leitor YAML; corrigir outros erros da especificação que ele identificar sem mudar o contrato efetivo.

## 2. Separar conteúdo público e interno
- Revisar os oito arquivos atuais de `docs/api/`, removendo referências a fases/partes e detalhes operacionais internos.
- Mover `agendador-webhooks.md` para `docs/interno/` e preservar as notas de implementação removidas em `docs/interno/implementacao-api.md`.
- Manter no conteúdo público as garantias úteis ao parceiro: idempotência, prazos, segurança contra duplicação, estados, regras fiscais, tentativas de entrega e tratamento de E0014, sem explicar filas, transações, leases, claims ou `waitUntil`.
- Atualizar índices e referências afetadas pela mudança de localização, incluindo o roadmap e a regra de arquitetura pertinente.

## 3. Atualizar textos e exemplos
- Remover “PDF em preparação” do LEIAME; documentar DANFSe disponível.
- Documentar `consulta_publica` como `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave_acesso}`; preservar `null` apenas quando não houver chave válida.
- Trocar exemplos `serie_dps: "00001"` por `"00900"`; glossário informa atribuição automática a partir de **00900**, faixa de aplicativo próprio **00001 a 49999**, preservando séries existentes.
- Em limites de uso: **“Nenhum limite de uso está ativo no momento”**, sem referência a fase ou limite inicial ainda indefinido; manter a restrição específica já documentada da verificação municipal.
- Remover `EMPRESA_NAO_AUTORIZADA` da lista pública de erros.
- Corrigir outras redações comprovadamente antigas encontradas na auditoria, como emissão ainda inexistente e eventos fiscais prometidos para fases futuras. Preservar operações ainda indisponíveis, sem anunciar nova funcionalidade.

## 4. Exemplos completos de webhooks
- Acrescentar exemplos JSON completos de `nota.autorizada` e `nota.rejeitada`: envelope e todos os campos do objeto `nota` em `dados`, coerentes com o formato efetivamente retornado.
- Usar valores fictícios explícitos, série `00900`, links oficiais e valores nulos apropriados à nota rejeitada; incluir erros governamentais no exemplo de rejeição.
- Remover a promessa de exemplos futuros e substituir o trecho interno de emissão por orientação pública e referência aos exemplos.

## Detalhes técnicos da validação automática
- Adicionar `src/test/validate-openapi.py`, usando `openapi-spec-validator` com seleção explícita de OpenAPI 3.1, e arquivo de dependências Python reproduzíveis.
- Integrar a validação à suíte Vitest existente, seguindo o padrão do teste XSD: o teste executa Python e falha se a especificação for inválida ou faltar o validador; não será ignorado silenciosamente.
- Incluir um documento inválido de controle para comprovar que o validador realmente recusa uma especificação incorreta. Não criar testes de texto, aparência ou snapshots.
- Documentar o comando de instalação das dependências e de execução do teste em `docs/interno/`; o teste fará parte de `bun run test`. Isso não equivale a afirmar um bloqueio automático da publicação pela plataforma.

## Verificação e entrega
- Executar o validador no arquivo final e o teste automático integrado.
- Conferir referências após a movimentação e a ausência dos termos internos e textos obsoletos em `docs/api/`.
- Informar o resultado exato da validação OpenAPI 3.1 e listar todos os arquivos alterados/criados/movidos.

**Estado atual:** documentação e API ainda não alteradas; validação OpenAPI ainda não executada. O ambiente não possui atualmente as dependências Python desse validador.