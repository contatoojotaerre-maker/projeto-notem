# DPS E1 — conferência externa obrigatória

Três exemplos **sem assinatura**, ambiente homologação, dados fictícios; não transmitir ao governo:
- simples-pj.xml: ME/EPP sem retenção, tomador PJ com CNPJ diferente do prestador e desconto incondicionado de 10,00.
- nao-optante-pf.xml: não optante, percentuais por esfera, tomador PF.
- estrangeiro.xml: tomador estrangeiro identificado por NIF; serviço não é automaticamente exportação.

Gerados pelo montador de src/lib/dps.ts. Tipo de inscrição CNPJ = 2; versão 1.01; série 1, números 1–3. Não foram reservados números no banco.

## Resultado com o XSD original e lxml
**Os três XML NÃO passam integralmente no XSD original.** Único erro reportado:
`Element '{http://www.sped.fazenda.gov.br/nfse}serie': [facet 'pattern'] The value '1' is not accepted by the pattern '^0{0,4}\d{1,5}$'.`

O padrão TSSerieDPS no ZIP oficial contém ^/$ como caracteres literais, não âncoras: defeito do esquema oficial. Por autorização do proprietário, o teste corrige **apenas** esse padrão para `0{0,4}\d{1,5}` em uma cópia em memória. O ZIP oficial e o conteúdo dos XML permanecem intactos.

Reprodução estrita (deve falhar):
`python3 src/test/validate-dps-xsd.py --official docs/exemplos/dps/simples-pj.xml docs/exemplos/dps/nao-optante-pf.xml docs/exemplos/dps/estrangeiro.xml`

Validação completa com a correção isolada em memória (os três devem passar sem erros):
`python3 src/test/validate-dps-xsd.py docs/exemplos/dps/simples-pj.xml docs/exemplos/dps/nao-optante-pf.xml docs/exemplos/dps/estrangeiro.xml`

Nenhum erro de validação é ignorado. Os testes verificam o ZIP intacto e a recusa de ambiente/série inválidos.

**Parte 3 bloqueada** até conferência externa e liberação do proprietário. Sincronização/presença dos arquivos no GitHub precisa ser confirmada; gravação local não comprova sincronização.
## Nova conferência de regras de negócio
E0431/E0432: campos de descontos zero e grupo vazio omitidos. E0710/E0712/E0713: matriz por situação do Simples aplicada. E0202: tomador nacional não pode ter o documento do prestador. Os três exemplos são regenerados pelo mesmo montador; números são ilustrativos, sem reserva no banco.
