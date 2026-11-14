# Documentação interna da notem

Esta pasta contém informações operacionais e de implementação. Não faz parte do contrato para parceiros e não deve ser incluída na futura página pública `/docs`.

| Arquivo | Conteúdo |
|---|---|
| `agendador-webhooks.md` | Configuração OIDC e processamento do Google Cloud Scheduler |
| `implementacao-api.md` | Notas de registro, emissão, consulta automática e DANFSe retiradas da documentação pública |

## Validação do contrato OpenAPI 3.1

Instalar as dependências Python de teste:
```sh
python3 -m pip install -r src/test/requirements-openapi.txt
```

Executar somente a validação:
```sh
python3 src/test/validate-openapi.py
```

Executar o teste integrado (também incluído em `bun run test`):
```sh
bunx vitest run src/test/openapi.test.ts
```

O validador usa explicitamente `OpenAPIV31SpecValidator`, versão 0.7.2 de `openapi-spec-validator`, para o contrato OpenAPI 3.1.0. YAML legível não é suficiente: propriedades indevidas e referências inválidas também devem reprovar. O teste inclui um contrato inválido de controle e falha se o validador estiver ausente; não há desvio silencioso.

Executar o teste antes de publicar alterações no contrato. A inclusão na suíte de testes não configura, por si só, um bloqueio automático de publicação na plataforma.