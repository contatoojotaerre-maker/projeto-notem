# Domínio oficial nos textos e campo "Endereço no painel" oculto

## 1. Configuração única do domínio oficial

Criar `src/lib/app-url.ts` com `APP_URL = 'https://app.notemfiscal.com.br'`, `API_BASE = APP_URL + '/api/v1'` e `appLink(path)`. Módulo sem dependências de servidor, usado por tela e servidor.

Pontos encontrados e o que muda:

| # | Local | Hoje | Depois |
|---|---|---|---|
| 1 | Nova organização: prévia do endereço | origem da página atual | `app.notemfiscal.com.br/o/{slug}` |
| 2 | Integração, aba "Como testar": exemplo curl e endereço da API | URL escrita à mão | `API_BASE` |
| 3 | Convite de membro (e-mail): `redirectTo` | origem da requisição | `APP_URL/definir-senha` |
| 4 | "Esqueci minha senha" (e-mail): `redirectTo` | origem da página | `APP_URL/redefinir-senha` |
| 5 | Dados da integração: campo `origin` devolvido pelo servidor | origem da requisição | removido (não é usado na tela) |
| 6 | Audiência do agendador (`webhook-scheduler.server.ts`) | URL escrita à mão | derivada de `APP_URL` (mesmo valor; validação OIDC inalterada) |

Ficam como estão (justificativa):
- Login com Google: o retorno precisa voltar à página atual para a sessão funcionar na pré-visualização; não é texto exibido nem e-mail.
- Exemplos curl/PowerShell de webhooks: mostram o endereço do parceiro, não o da notem.
- Leitura do link de retorno na tela de senha, armazenamento de sessão da pré-visualização e relatório de erros: técnicos, não exibem endereços.
- Navegação interna continua relativa.

Observação: com o item 4, na pré-visualização o link do e-mail de recuperação abrirá o domínio oficial (comportamento pedido).

## 2. "Endereço no painel" oculto em "Nova organização"

- Campo escondido por padrão; continua gerado a partir do nome.
- Linha discreta: "Endereço no painel: app.notemfiscal.com.br/o/onedesp" + link "Editar", que mostra o campo atual.
- Erros (curto, inválido, já existe) aparecem mesmo com o campo oculto e abrem o campo automaticamente.
- Regras inalteradas: 3–50 caracteres, minúsculas/números/hífen, unicidade, imutável após criar (banco intacto).

## Testes e documentação
- Teste: `APP_URL`/`API_BASE` com os valores oficiais e `appLink('/definir-senha')`.
- `docs/api/` já usa o domínio oficial; sem mudança de contrato. Registrar regra no AGENTS.md.
