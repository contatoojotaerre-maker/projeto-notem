# Fase C · Parte 3 — IBS/CBS na NFS-e

Princípio mantido: a notem envia só a classificação; o governo calcula e devolve os valores. Nada é enviado ao governo para teste; não toco em `transmissor/`.

## O que já existe hoje (conferido)
- Catálogo de indicadores de operação com 26 códigos: faltam os 7 novos e os 5 que saem ainda estão ativos.
- Perfil de serviço já tem "indicador de operação" e NBS (o único serviço cadastrado, 01.05.01 da Group Jota, está sem NBS e sem indicador).
- A API de serviços já expõe `indicador_operacao_ibscbs`.
- O DANFSe já tem o bloco "TRIBUTAÇÃO IBS/CBS", mas com dois campos errados (ver 3.5).
- Nenhuma nota emitida até agora tem competência a partir de 01/10/2026 com o grupo IBS/CBS; nenhuma rejeição E0855 registrada.

## Decisões para aprovar
1. **Data de obrigatoriedade x E0855.** O Anexo VI v1.04.01 (regra E0855) diz que o grupo é obrigatório para competência a partir de **01/10/2026**. O briefing pede padrão 01/01/2027. Proposta: manter 01/01/2027, mas com **uma data por ambiente** (homologação e produção), para o administrador poder antecipar só a homologação, se o governo começar a cobrar lá. A rejeição E0855 vira uma mensagem clara avisando que a data precisa ser antecipada.
2. **Bloco IBS/CBS no DANFSe.** A NT 008 v1.02 (item 2.3) só permite suprimir os blocos de tomador, destinatário, intermediário e ISSQN; o de IBS/CBS não está na lista. Proposta: **o bloco sempre aparece**, preenchido quando a NFS-e tiver o grupo e com "-" quando não tiver (como hoje). Se preferir ocultar quando não houver o grupo, eu faço, mas isso diverge do modelo oficial.
3. **Regime de apuração do IBS/CBS.** O Anexo VI tem três valores: 1 (pelo Simples), **2 (CBS pelo Simples e IBS pelo regime regular, para quem ultrapassa o sublimite)** e 3 (regular). Proposta: oferecer só 1 e 3, como no briefing, e documentar o 2 como não suportado nesta fase.
4. **Compatibilidade da API.** `indicador_operacao_ibscbs` (campo atual) continua aceito e devolvido, marcado como obsoleto, com o mesmo valor de `classificacao_ibscbs.indicador_operacao`. Se os dois vierem com valores diferentes, a resposta é 422.
5. **Outros casos não suportados que achei nas regras** (além dos que estão no briefing), bloqueados com mensagem clara:
   - subitens que exigem `tpOper`: 25.05, 15.09, 17.12 e 10.05 (E0903);
   - CST 800 e 811 (transferência/ajuste de crédito, que dependem de NFS-e de crédito/débito, recusadas pelo release 1);
   - cClassTrib 550016/550022 (exigem Tributação Regular) e 515001 (Diferimento), que já estão no briefing.
   Os 820xxx (documentos informativos) ficam permitidos.

## 3.1 Catálogos (somente leitura, versionados)
- **Classificações (cClassTrib):** as 73 linhas com NFSE = Sim do CSV, com todos os campos pedidos (CST e descrição, exige tributação, reduções IBS/CBS, tributação regular, crédito presumido, diferimento, tipo de receita bruta do Simples, tipo de doação, URL da legislação).
- **Indicadores (cIndOp v1.03):** os 28 com indNFSe = S; os 7 novos entram; 030103, 030104, 050103, 050104 e 080101 ficam **inativos**, sem ser apagados. Também guardo o "local de incidência na NFS-e" de cada código.
- **Correlação (Anexo VIII):** 209 itens, com NBS, cClassTrib e cIndOp alternativos. Usada só como sugestão.
- Registro de versão de cada catálogo: arquivo de origem, versão, SHA-256, quantidade de linhas e data de carga. A carga é idempotente e gerada a partir dos arquivos em `docs/referencias/rtc/`.

## 3.2 Cadastros
- **Configuração fiscal (só ME/EPP):** "Regime de apuração do IBS/CBS", com "Pelo Simples Nacional (DAS)" como padrão e "Pelo regime regular". As empresas ME/EPP existentes recebem o padrão. Para não optante e MEI o campo não se aplica.
- **Perfil de serviço**, em uma seção nova "IBS/CBS":
  - NBS;
  - classificação (cClassTrib, só do catálogo; o CST vem junto);
  - indicador de operação: obrigatório se a classificação exige tributação (E0860) e proibido se não exige (E0859); códigos inativos não podem ser escolhidos;
  - "Consumo pessoal" (desligado por padrão);
  - código de atividade do Simples, com as regras de "se e somente se": 16.01 → 10, 99.04.01 → 11, 7.02/7.05 → 12 ou 13.
- **Sugestão do Anexo VIII:** ao escolher o código de serviço, aparece um quadro com NBS, classificação, indicador e atividade, e o botão "Aplicar sugestão". Nunca aplico sozinho. Um valor sugerido que a NFS-e não aceita (por exemplo cIndOp 080101/130101/130201, cClassTrib 011001/011005) ou que esta fase bloqueia aparece como "não aplicável" e não é copiado. "IMP" (atividade impeditiva no Simples) aparece como alerta.
- **Serviço "a revisar":** um serviço com indicador inativo ou com classificação incoerente recebe essa marca na lista e na situação da empresa.
- **Endereço do tomador:** aviso fixo no cadastro de tomadores e na emissão: "o município do tomador deve ser o mesmo do cadastro na Receita Federal". Também documentado na API.
- As regras ficam no esquema compartilhado (painel e API) e também em gatilhos do banco.

## 3.3 Situação da empresa ("pronta para emitir")
- Datas novas, só o administrador da plataforma altera, com confirmação e auditoria, na página "Leiaute fiscal": obrigatoriedade do IBS/CBS (por ambiente, padrão 01/01/2027) e vigência do perfil `nt009r2` (por ambiente, vazia).
- **Antes da data:** aviso "Classificação IBS/CBS pendente — obrigatória a partir de 01/01/2027". Ele vai num campo novo `avisos` e **não bloqueia** (hoje qualquer item pendente bloquearia).
- **A partir da data:** a classificação completa entra nos itens da empresa (regime, para ME/EPP) e dos serviços ativos.
- A rotina diária que já existe recalcula a situação, então `empresa.situacao_alterada` dispara quando a data é ultrapassada.

## 3.4 DPS
- **Perfil `nt009r1`:** grupo `IBSCBS` somente quando a competência for igual ou posterior à data de obrigatoriedade do ambiente, nesta ordem: `indFinal` (se marcado) → `cIndOp` (se exige tributação) → `indDest`=0 → `valores/trib/CST` → `cClassTrib` → `gIBSCBS` vazio (se exige tributação).
- **Validação antes da numeração** (422, sem consumir número):
  - NBS presente (E0322);
  - CST igual aos 3 primeiros dígitos (E0959);
  - indicador de operação de acordo com "exige tributação" (E0859/E0860);
  - tomador com CPF/CNPJ e endereço nacional quando houver tributação e o indicador apontar para o endereço do tomador ou do destinatário (E0239/E0243). Isso também impede o caso de tomador estrangeiro;
  - casos não suportados.
- A classificação vai junto com a nota no momento da numeração, para a remontagem/conversão usar exatamente o que foi validado.
- **Leiaute antigo (`nt004`):** não monta o grupo. Se a competência exigir IBS/CBS e o leiaute vigente ainda for o antigo, a nota é bloqueada antes da numeração. Uma DPS antiga que precisar do grupo não é convertida: fica como "não enviada".
- **Perfil `nt009r2` (desligado):** `regApIBSCBSSN` em `regTrib`, `cAtvSN` em `cServ`, `indDest`/`dest` na raiz, `opSimpNac`=4 aceito só nesse perfil (sem opção no cadastro por enquanto). Testado pela estrutura do Anexo VI, porque ainda não existe XSD.
- **Rejeições traduzidas:** E0855, E0322, E0859, E0860, E0958, E0959, E0960/E0961, E0239/E0243 e a divergência de município do tomador com o cadastro da Receita. Esta última ainda tem código "EXXX" no Anexo VI, então será reconhecida pelo texto oficial.

## 3.5 Leitura, API, webhooks e DANFSe
- **Leitura da NFS-e autorizada e das notas do ADN:** localidade de incidência, `vBC`, alíquotas, reduções e alíquotas efetivas, `vIBSTot`, IBS UF/Mun, `vCBS`, `vTotNF`, `vReceitaBrutaSN`, `gTribSN`, `verCalcIBSCBS`. Ficam guardados com a nota da notem e com as notas externas/recebidas.
- **API:**
  - objeto `ibs_cbs` (somente leitura, null sem o grupo) em notas, notas recebidas e webhooks;
  - `classificacao_ibscbs` em serviços e `regime_apuracao_ibscbs` na configuração fiscal;
  - `avisos` na situação da empresa;
  - novos `GET /catalogos/classificacoes-tributarias`, `GET /catalogos/indicadores-operacao` (com inativos sob parâmetro) e `GET /catalogos/sugestao-classificacao?codigo_servico=`.
  - Tudo documentado em `docs/api/` (OpenAPI 3.1 validado), explicando que os valores são calculados pelo governo.
- **Painel:** os valores de IBS/CBS aparecem no detalhe da nota.
- **DANFSe**, conferido campo a campo com a NT 008 v1.02:
  - "Exclusões e Reduções da Base de Cálculo" passa a ser a soma oficial (desconto incondicionado + ajuste + ISSQN + PIS + COFINS); hoje mostra só o ajuste;
  - "Total do IBS/CBS" passa a ser `vIBSTot + vCBS`; hoje aparece "-".

## Testes
- Carga dos catálogos: contagens (73/28/209) e os 5 inativos.
- Cada regra do cadastro e da validação antes da numeração, com um teste por regra.
- DPS com IBS/CBS validadas no XSD do release 1: Simples e não optante; tributação integral; redução (200052); isenção/imunidade sem `cIndOp`/`gIBSCBS` (410999). Antes da data, a DPS sai sem o grupo.
- `nt009r2` pela estrutura do Anexo VI; troca de datas e permissão do administrador.
- Leitura e DANFSe com uma NFS-e de exemplo com o grupo, nos dois formatos.
- API: contrato e OpenAPI; isolamento entre organizações reexecutado.

## Detalhes técnicos
- Migrações: `ibscbs_classifications`, `ibscbs_service_correlations`, `fiscal_catalog_versions`; colunas novas em `ibscbs_operation_indicators`, `company_fiscal_settings`, `company_service_profiles` e `platform_settings`. Todas com revogação de anon/authenticated e grants mínimos.
- Funções: `set_*` de datas auditadas e só para administrador da plataforma; RPC de busca estendida.
- Código: `src/lib/ibscbs.ts` (regras compartilhadas puras), `dps.ts`/`dps-layout.ts` (grupo e perfil r2), `nfse-layout-read.ts`/`nfse-xml.ts` (leitura), `api-contract.ts`, `readiness`, `danfse.server.ts`, rotas `/api/v1/catalogos/*`, `fiscal-tabs.tsx`, `layout-settings.tsx`.
- Documentação: `docs/interno/ibs-cbs.md` e regra em `src/lib/AGENTS.md`.

Ao final: relatório e pausa. Publico só depois da sua aprovação.
