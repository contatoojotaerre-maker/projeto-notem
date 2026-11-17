---
titulo: Glossário
ordem: 9
atualizado: 2026-11-17
descricao: Termos usados na API e na documentação da notem.
---

# Glossário


| Termo | Significado |
|---|---|
| **Organização** | Espaço que agrupa empresas, equipe e integrações. Ex.: um sistema parceiro (VistoCash) ou um grupo empresarial. Quem cria a organização é responsável por ela e pela cobrança. |
| **Integração** | Conexão de um sistema com a notem, pertencente a uma organização. Tem chaves por ambiente (até duas ativas durante troca) e opera todas as empresas da organização. |
| **Chave de acesso (da integração)** | Credencial secreta usada no cabeçalho `Authorization`. Define também o ambiente. |
| **Ambiente** | `homologacao` (testes, sem validade fiscal) ou `producao` (validade fiscal). |
| **Empresa (emitente / prestador)** | Empresa com CNPJ que emite a nota de serviço. |
| **Tomador** | Quem contratou o serviço e recebe a nota (pessoa física, jurídica ou estrangeira). |
| **Intermediário** | Terceiro que intermedia o serviço, quando houver. |
| **Certificado A1** | Certificado digital e-CNPJ (ICP-Brasil) da empresa, usado para assinar e transmitir as notas. |
| **Situação da empresa** | Indica se a empresa está pronta para emitir (certificado, configuração fiscal, serviço, município). |
| **Configuração fiscal** | Dados tributários da empresa: Simples Nacional, regime de apuração, regime especial, tributos aproximados. |
| **Serviço** | Modelo de um serviço prestado pela empresa: código nacional, descrição, tributação do ISS, retenção. |
| **Código de tributação nacional** | Código de 6 dígitos da lista nacional de serviços (`cTribNac`). |
| **NBS** | Nomenclatura Brasileira de Serviços (9 dígitos). Usada no IBS/CBS. |
| **ISS** | Imposto sobre serviços, municipal. |
| **IBS / CBS** | Tributos da reforma tributária sobre bens e serviços. Obrigatórios na NFS-e conforme cronograma oficial (Simples Nacional a partir de 01/01/2027). |
| **Simples Nacional** | Regime tributário simplificado. Situações: não optante, MEI, ME/EPP. |
| **Município de incidência** | Município onde o ISS é devido. |
| **Convênio** | Adesão do município ao sistema nacional da NFS-e. Sem convênio ativo no ambiente, não é possível emitir para aquele município. |
| **DPS** | Declaração de Prestação de Serviço: o pedido de emissão enviado ao governo. Aprovada, gera a NFS-e. |
| **Série / número da DPS** | Identificação sequencial da DPS. Séries atribuídas automaticamente a partir de 00900; faixa de aplicativo próprio: 00001 a 49999. Séries existentes são preservadas; números usados nunca são reaproveitados. |
| **NFS-e** | Nota Fiscal de Serviço eletrônica autorizada pelo governo. |
| **Chave de acesso da NFS-e** | Identificador oficial da nota, com 50 posições. Quando o emitente tem CNPJ alfanumérico, as 14 posições do CNPJ podem conter letras. |
| **CNPJ alfanumérico** | Formato da Receita Federal para novas inscrições desde julho de 2026: 12 posições com números ou letras e 2 dígitos verificadores. A notem aceita os dois formatos. |
| **DANFSe** | Representação em PDF da NFS-e. |
| **Competência** | Data (mês) a que o serviço se refere. Não pode ser posterior à data de emissão. |
| **Situação da nota** | Em processamento, em verificação, autorizada, rejeitada, cancelamento em análise, cancelada, substituída, cancelada pela prefeitura. |
| **Em verificação** | O governo não confirmou o resultado da emissão; a notem confirma automaticamente, sem duplicar a nota. |
| **Evento** | Fato registrado sobre uma nota (cancelamento, manifestação, ação da prefeitura). |
| **Manifestação** | Confirmação ou rejeição da nota pelo tomador, prestador ou intermediário. |
| **Substituição** | Emissão de uma nova nota que cancela e substitui uma anterior. |
| **Webhook** | Aviso automático que a notem envia ao sistema parceiro quando algo acontece. |
| **Idempotência** | Garantia de que reenviar o mesmo pedido (com a mesma `Idempotency-Key`) não duplica a operação. |
| **id_externo** | Identificador do próprio sistema parceiro, guardado pela notem para localizar o recurso. |
| **id_requisicao** | Identificador de cada chamada à API, usado no suporte. |
