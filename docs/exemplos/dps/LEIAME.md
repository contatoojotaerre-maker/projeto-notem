# DPS E1 — conferência externa obrigatória

Três exemplos **sem assinatura**, ambiente homologação, dados fictícios; não transmitir ao governo:
- simples-pj.xml: ME/EPP sem retenção, tomador PJ.
- nao-optante-pf.xml: não optante, percentuais por esfera, tomador PF.
- estrangeiro.xml: tomador estrangeiro identificado por NIF; serviço não é automaticamente exportação.

Gerados pelo montador de src/lib/dps.ts. Tipo de inscrição CNPJ = 2; versão 1.01; série 1, números 1–3. Não foram reservados números no banco.

## Resultado com o XSD original e lxml
**Os três XML NÃO passam integralmente no XSD original.** Único erro reportado:
`Element '{http://www.sped.fazenda.gov.br/nfse}serie': [facet 'pattern'] The value '1' is not accepted by the pattern '^0{0,4}\d{1,5}$'.`

O padrão TSSerieDPS no ZIP oficial contém âncoras ^/$, que não têm semântica de âncora em expressões regulares XML Schema. O esquema não foi alterado e nenhum caractere artificial foi colocado na série. Demais campos não produziram erros nessa execução. Isso não equivale a aprovação do XML completo.

Reprodução estrita (deve falhar):
`python3 src/test/validate-dps-xsd.py docs/exemplos/dps/simples-pj.xml docs/exemplos/dps/nao-optante-pf.xml docs/exemplos/dps/estrangeiro.xml`

Teste diagnóstico `--known-series-issue` aceita apenas esse erro conhecido e falha se surgir qualquer outro. Não substitui a validação estrita nem muda o XSD.

**Parte 3 bloqueada** até conferência externa e liberação do proprietário. Sincronização/presença dos arquivos no GitHub precisa ser confirmada; gravação local não comprova sincronização.