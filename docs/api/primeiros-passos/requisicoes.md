---
titulo: Requisições e formatos
ordem: 4
atualizado: 2026-11-17
descricao: Endereço, versão, formato JSON, padrões de dados, texto aceito pela NFS-e, listas e segurança.
---

# Requisições e formatos

Estas regras valem para **todas** as rotas. Em caso de dúvida, elas prevalecem sobre exemplos isolados.

## Endereço e versão
- Base oficial: `https://app.notemfiscal.com.br/api/v1`.
- Toda rota começa com `/api/v1`. Mudanças **compatíveis** (novos campos, novas rotas, novos valores opcionais) acontecem dentro da v1 sem aviso prévio. Mudanças **incompatíveis** só em uma nova versão (`/api/v2`), com prazo de convivência comunicado.
- O sistema parceiro **deve ignorar campos que não conhece** nas respostas.

## Formato das mensagens
- JSON em UTF-8: `Content-Type: application/json; charset=utf-8`.
- **Nomes de campos em português**, minúsculos, sem acentos, separados por sublinhado: `razao_social`, `valor_servico`, `codigo_municipio`.
- Identificadores da notem: texto UUID no campo `id`.
- **Identificador do parceiro:** recursos criados pelo parceiro aceitam `id_externo` (texto, até 100 caracteres), único por organização, para o parceiro localizar o recurso com o próprio código.

## Padrões de dados
| Tipo | Formato | Exemplo |
|---|---|---|
| Valores em reais | texto, ponto decimal, 2 casas | `"150.00"` |
| Percentuais | texto, ponto decimal, até 2 casas | `"2.00"` |
| Data | `AAAA-MM-DD` | `"2026-11-03"` |
| Data e hora | ISO 8601 com fuso | `"2026-11-03T14:30:00-03:00"` |
| CNPJ | 14 posições, numérico ou alfanumérico (letras maiúsculas nas 12 primeiras, 2 dígitos verificadores numéricos). Entrada com máscara ou minúsculas é aceita e normalizada; as respostas trazem sempre 14 caracteres sem máscara | `"11222333000181"`, `"12ABC34501DE35"` |
| CPF / CEP / telefone | somente números | `"52998224725"` |
| Município | código IBGE de 7 dígitos | `"4205407"` |
| País | código ISO de 2 letras | `"BR"` |
| Booleanos | `true` / `false` | |

Valores monetários **nunca** são enviados como número (`150.0`), para evitar erros de arredondamento.

### Texto aceito pela NFS-e
O padrão nacional aceita nos campos de texto somente letras, números e pontuação do conjunto Latin-1 (acentos do português incluídos). Vale para todos os textos da nota e dos eventos: nomes, endereços, e-mail, descrição do serviço, informações complementares e justificativas.

Antes de validar, a notem ajusta automaticamente o texto colado de editores:

| Recebido | Enviado ao governo |
|---|---|
| Travessões `—` `–` | `-` |
| Aspas curvas `“ ” ‘ ’` | aspas retas `" '` |
| Reticências `…` | `...` |
| Espaços especiais (ex.: espaço não separável) | espaço comum |
| Espaços repetidos | um espaço |
| Espaços no início e no fim | removidos |
| Quebras de linha | espaço; **mantidas somente na descrição do serviço** |

A nota guarda e devolve o texto já ajustado, que é exatamente o enviado ao governo. O que não tem equivalente (por exemplo, emojis) é recusado antes de numerar ou enviar: `422 REGRA_DE_NEGOCIO`, com `campo` indicando onde está o caractere e `mensagem` "contém caracteres não aceitos pela NFS-e". Limites de tamanho valem para o texto já ajustado.

## Respostas de sucesso
| Situação | Status | Corpo |
|---|---|---|
| Consulta | `200` | o recurso |
| Criação concluída | `201` | o recurso criado |
| Pedido aceito, resultado posterior (ex.: nota em verificação) | `202` | o recurso com sua situação atual |
| Lista | `200` | `{ "dados": [...], "proximo_cursor": "..." \| null }` |

## Listas e paginação
- Parâmetros: `limite` (padrão 50, máximo 100) e `cursor` (o `proximo_cursor` recebido).
- Uma lista pode ser percorrida até 100.000 posições; para ir além, use filtros (por exemplo, período).
- Filtros de período (`emitida_de`/`emitida_ate`) usam datas reais `AAAA-MM-DD`, com início anterior ou igual ao fim e no máximo 366 dias.
- Buscas de texto (`busca`) aceitam de 2 a 150 caracteres.
- `proximo_cursor = null` indica o fim da lista.
- A ordem padrão é do mais recente para o mais antigo, salvo indicação na rota (catálogos: por nome/código).
- O `cursor` é opaco: não o monte nem o interprete.

## Segurança
- Somente HTTPS.
- A API é para uso entre servidores: não há liberação de CORS para navegadores. Pedidos `OPTIONS` recebem `204` sem permissões de origem.
- Os registros de chamadas (aba Chamadas da integração, no painel) guardam o mínimo: documentos aparecem mascarados (só os 2 últimos dígitos), e-mail, telefone e endereço são omitidos, e XML/PDF aparecem só como tipo e tamanho. Ficam disponíveis por 90 dias para proprietário, administrador e desenvolvedor da organização.
- Nunca envie a chave em parâmetros de URL.
- Certificados digitais enviados pela API nunca são devolvidos em nenhuma resposta.

## Registro e retenção
Os registros de chamadas têm dados sensíveis removidos ou mascarados e são mantidos por 90 dias.
