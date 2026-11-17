---
titulo: Ambientes
ordem: 3
atualizado: 2026-11-17
descricao: Homologação e produção, o que é separado por ambiente e o que é compartilhado.
---

# Ambientes

| Ambiente | Chave | Notas |
|---|---|---|
| `homologacao` | `ntm_homolog_...` | testes, sem validade fiscal |
| `producao` | `ntm_prod_...` | validade fiscal |

O ambiente vem da chave usada na chamada; não há parâmetro para escolhê-lo.

## O que muda por ambiente
**Empresas, configuração fiscal, certificado e serviços são compartilhados entre os ambientes**: são os mesmos dados com a chave de homologação ou de produção. O que muda por ambiente são as **notas**, a **numeração** e a **verificação do município**.

> [!ATENCAO]
> **Cadastro compartilhado entre ambientes.** Empresa, configuração fiscal, serviços, tomadores e certificado são **os mesmos** em homologação e produção (as notas são separadas). Uma alteração feita com a chave de homologação vale também para a produção. Por isso, toda alteração desses cadastros feita com chave de homologação fica registrada e aparece como aviso no painel da organização ("Serviço alterado pela chave de homologação da integração X") até um proprietário ou administrador marcar como lido. Recomendação: em testes, use uma empresa de testes ou evite alterar o cadastro com a chave de homologação.

## Homologação
- Notas de homologação não têm validade fiscal; o PDF mostra **NFS-e SEM VALIDADE JURÍDICA**.
- Nem todo município atende homologação. A [situação da empresa](../guias/municipios-conveniados.md) informa quando o município não está disponível no ambiente.
- Os limites de uso são contados separadamente por ambiente. Veja [Limites de uso](limites.md).
