# Glossário da notem

| Termo | Significado |
|---|---|
| **Organização** | Espaço que agrupa empresas, equipe e integrações. Ex.: um sistema parceiro (VistoCash) ou um grupo empresarial. Quem cria a organização é responsável por ela e pela cobrança. |
| **Integração** | Conexão de um sistema com a notem, pertencente a uma organização. Tem uma chave por ambiente e uma lista de empresas autorizadas. |
| **Chave de acesso (da integração)** | Credencial secreta usada no cabeçalho `Authorization`. Define também o ambiente. |
| **Ambiente** | `homologacao` (testes, sem validade fiscal) ou `producao` (validade fiscal). |
| **Empresa (emitente / prestador)** | Empresa com CNPJ que emite a nota de serviço. |
| **Tomador** | Quem contratou o serviço e recebe a nota (pessoa física, jurídica ou estrangeira). |
| **Intermediário** | Terceiro que intermedia o serviço, quando houver. |
| **Certificado A1** | Certificado digital e-CNPJ (ICP-Brasil) da empresa, usado para assinar e transmitir as notas. |
| **Situação da empresa** | Indica se a empresa está pronta para emitir (certificado, configuração fiscal, serviço, município). |
| **Configuração fiscal** | Dados tributários da empresa: Simples Nacional, regime de apuração, regime especial, tributos aproximados. |
| **Serviço (perfil de serviço)** | Modelo de um serviço prestado pela empresa: código nacional, descrição, tributação do ISS, retenção. |
| **Código de tributação nacional** | Código de 6 dígitos da lista nacional de serviços (`cTribNac`). |
| **NBS** | Nomenclatura Brasileira de Serviços (9 dígitos). Usada no IBS/CBS. |
| **ISS** | Imposto sobre serviços, municipal. |
| **IBS / CBS** | Tributos da reforma tributária sobre bens e serviços. Obrigatórios na NFS-e conforme cronograma oficial (Simples Nacional a partir de 01/01/2027). |
| **Simples Nacional** | Regime tributário simplificado. Situações: não optante, MEI, ME/EPP. |
| **Município de incidência** | Município onde o ISS é devido. |
| **Convênio** | Adesão do município ao sistema nacional da NFS-e. Sem convênio ativo no ambiente, não é possível emitir para aquele município. |
| **DPS** | Declaração de Prestação de Serviço: o pedido de emissão enviado ao governo. Aprovada, gera a NFS-e. |
| **Série / número da DPS** | Identificação sequencial da DPS. A notem usa séries de 00001 a 49999, atribuídas automaticamente; números nunca se repetem. |
| **NFS-e** | Nota Fiscal de Serviço eletrônica autorizada pelo governo. |
| **Chave de acesso da NFS-e** | Identificador oficial da nota, com 50 dígitos. |
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
