---
titulo: Conceitos
ordem: 1
atualizado: 2026-11-17
descricao: Organização, integração, empresa, serviço, tomador e nota: como as peças da notem se relacionam.
---

# Conceitos

```fluxo
Organização -> Integração -> Chave de homologação
Organização -> Integração -> Chave de produção
Organização -> Empresa -> Serviços
Organização -> Empresa -> Tomadores
Empresa -> Nota
```

- **Organização**: o espaço do seu sistema na notem. Reúne empresas, equipe e integrações.
- **Integração**: a conexão do seu sistema com a notem. Tem chaves por ambiente e opera **todas** as empresas da organização.
- **Empresa**: a emitente das notas, com CNPJ, configuração fiscal, certificado A1 e serviços.
- **Serviço**: o modelo do que a empresa presta (código nacional, tributação do ISS, retenção, classificação IBS/CBS). Toda nota usa um serviço.
- **Tomador**: quem contratou o serviço. Pode ser informado na nota ou cadastrado na empresa.
- **Nota**: a NFS-e. É emitida no ambiente da chave e passa por situações descritas em [Ciclo de vida da nota](ciclo-de-vida.md).

Os demais termos estão no [Glossário](../primeiros-passos/glossario.md).
