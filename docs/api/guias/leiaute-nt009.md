---
titulo: Leiaute da NFS-e (NT 009)
ordem: 14
atualizado: 2026-11-17
descricao: Como a notem acompanha as mudanças de leiaute do governo sem exigir mudanças no seu sistema.
---

# Leiaute da NFS-e (NT 009)

O governo publica novas versões do leiaute da DPS e da NFS-e por notas técnicas. A NT 009 traz, entre outras mudanças, o grupo IBS/CBS e o CNPJ alfanumérico.

## O que a notem faz
- O leiaute é escolhido **imediatamente antes de cada envio**: em homologação, o mais recente aceito pelo governo; em produção, conforme a data de vigência oficial.
- A API não muda de formato quando o leiaute muda: os campos em português continuam os mesmos e a notem monta o XML oficial.
- Uma nota já numerada que ainda não foi enviada é convertida para o leiaute em vigor com **o mesmo número**.

## Campos guardados para o próximo leiaute
Alguns campos já são aceitos e guardados, mas só passam a ser enviados ao governo no próximo leiaute da NT 009:
- `regime_apuracao_ibscbs` da [configuração fiscal](configuracao-fiscal.md) (somente ME/EPP);
- `atividade_simples` da classificação IBS/CBS do serviço (veja [IBS/CBS](ibs-cbs.md)).

> [!IMPORTANTE]
> Mudanças de leiaute não exigem nova versão da API. Mudanças incompatíveis só acontecem em `/api/v2`. Veja [Requisições e formatos](../primeiros-passos/requisicoes.md).
