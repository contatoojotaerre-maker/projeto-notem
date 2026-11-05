# Ajustes em Integrações e Webhooks

## 1. Integração padrão por organização
- Na criação de organização (Administração > Organizações), criar no mesmo passo, dentro do banco, uma integração com o mesmo nome da organização: ativa, escopo "todas as empresas", sem chaves e sem webhooks.
- Se a criação da integração falhar, a organização também não é criada (operação única).
- Organizações existentes não recebem nada. Renomear e criar outras integrações continua como hoje.
- Teste: criar organização gera exatamente uma integração com o mesmo nome e zero chaves.

## 2. Chaves sem expiração, tela mais clara
- Confirmar que nenhuma chave tem prazo (hoje não há coluna de expiração); documentar "válida até ser revogada; revogação imediata".
- Limite de 2 ativas por ambiente mantido no banco.
- Tela por ambiente:
  - 0 ativas: "Gerar chave".
  - 1 ativa: "Gerar nova chave" + texto "Use para trocar a chave sem interromper o sistema parceiro. Depois que ele estiver usando a nova, revogue a antiga."
  - 2 ativas: aviso "Há duas chaves ativas neste ambiente. Revogue a antiga quando o sistema parceiro estiver usando a nova."; selo "Mais recente" na chave mais nova; "Último uso" de cada uma (ou "Nunca usada"); botão de gerar oculto.
- Sem revogação automática nem prazos.
- Teste: regra de estado da tela (0/1/2 ativas) e identificação da mais recente.

## 3. Exemplo do webhook em curl
- No cadastro e no detalhe de cada endereço: abas "curl (Linux/macOS)" e "PowerShell (curl.exe)", com botão copiar.
- POST para a URL cadastrada; cabeçalhos Content-Type, Notem-Evento, Notem-Evento-Id, Notem-Entrega-Id, Notem-Assinatura (valor ilustrativo `t=...,v1=...`) e, se configurado, o cabeçalho de autorização com valor mascarado (`••••••••`).
- Corpo: envelope do contrato; eventos sem dados definidos mantêm `"dados": {}`.
- Aspas tratadas para cada shell (PowerShell usa `curl.exe` e aspas simples com escape).
- Substitui o exemplo JSON atual. Testes do gerador (cabeçalhos, máscara, escape).

## 4. Idioma
- Registrar no AGENTS.md: responder sempre em português do Brasil.

## Documentação (docs/api/)
- `convencoes.md`/`LEIAME.md`: chaves sem expiração, até 2 ativas por ambiente, procedimento de troca, integração padrão criada com a organização.
- `webhooks.md`: exemplo curl e PowerShell.
- `openapi.yaml`: descrição de autenticação atualizada (sem expiração).

## Fora do escopo
Nenhuma outra alteração; nada em `transmissor/`.
