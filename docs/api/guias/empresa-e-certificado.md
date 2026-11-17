---
titulo: Empresa e certificado
ordem: 2
atualizado: 2026-11-17
descricao: Cadastro da empresa emitente, desativação, exclusão e certificado digital A1.
---

# Empresa e certificado

Rotas para o sistema parceiro cadastrar e preparar as empresas emitentes, sem que o cliente final acesse a notem.

## Regras gerais
- Uma integração opera **todas as empresas da sua organização** (não há seleção de empresas por integração).
- Valores fiscais são enviados em texto legível (ex.: `"me_epp"`); a notem converte para os códigos oficiais.
- `Idempotency-Key` é aceito em `POST`, `PATCH`, `PUT` e `DELETE` (24 h por integração e ambiente; veja [Idempotência](../primeiros-passos/idempotencia.md)) e recomendado em `POST /empresas`.
- Alterações feitas pela API aparecem no painel como "Alterado via API — integração X".
- Empresas, configuração fiscal, certificado e serviços são compartilhados entre homologação e produção. Veja [Ambientes](../primeiros-passos/ambientes.md).

## Empresa

### Objeto `empresa`
```json
{
  "id": "UUID",
  "id_externo": "ECV-1029",
  "cnpj": "11222333000181",
  "razao_social": "Vistoria Exemplo LTDA",
  "nome_fantasia": "Vistoria Exemplo",
  "inscricao_municipal": "12345",
  "email": "contato@exemplo.com.br",
  "telefone": "48999990000",
  "endereco": {
    "cep": "88980000",
    "logradouro": "Rua Exemplo",
    "numero": "100",
    "complemento": null,
    "bairro": "Centro",
    "codigo_municipio": "4212254",
    "municipio": "Passo de Torres",
    "uf": "SC"
  },
  "ativa": true,
  "criada_em": "2026-11-05T10:00:00-03:00",
  "atualizada_em": "2026-11-05T10:00:00-03:00"
}
```
- `municipio` e `uf` são preenchidos pela notem a partir de `codigo_municipio` (não enviar).
- `cnpj`: 14 posições, numérico (`11222333000181`) ou alfanumérico (`12ABC34501DE35`). Máscara e minúsculas são aceitas na entrada (`12.abc.345/01de-35`); a resposta traz sempre o valor normalizado. O filtro `?cnpj=` aceita o mesmo formato.
- `cnpj` é imutável depois que a empresa recebe certificado ou série de numeração (`409 CNPJ_IMUTAVEL`).
- `id_externo` é único por organização (`409 ID_EXTERNO_DUPLICADO`). Pode ser definido ou trocado apenas pela API.

### Rotas
| Método e rota | Descrição | Respostas |
|---|---|---|
| `POST /empresas` | Cadastra | `201` empresa · `409 EMPRESA_DUPLICADA` (mesmo CNPJ na organização; `detalhes` traz o `id` existente) · `409 ID_EXTERNO_DUPLICADO` |
| `GET /empresas` | Lista. Filtros: `cnpj`, `id_externo`, `ativa`, `busca` (nome) | `200` lista paginada |
| `GET /empresas/{id}` | Consulta | `200` · `404` |
| `PATCH /empresas/{id}` | Altera campos enviados. `ativa: false` desativa; `ativa: true` reativa | `200` · `409 CNPJ_IMUTAVEL` |
| `DELETE /empresas/{id}` | Exclui definitivamente | `204` · `409 EMPRESA_POSSUI_HISTORICO` |

**Desativar × excluir**
- **Desativar** (`PATCH ativa: false`): bloqueia novas emissões, mantém todo o histórico; pode ser reativada.
- **Excluir** (`DELETE`): só é permitido se a empresa **nunca reservou número de DPS e não tem notas** em nenhum ambiente. Remove a empresa, seus serviços e o certificado guardado. Caso contrário: `409 EMPRESA_POSSUI_HISTORICO` — use desativar. (Notas fiscais precisam ser guardadas, e a numeração já usada no governo não pode ser reaproveitada.)

## Certificado digital (A1)

`POST /empresas/{id}/certificado` — envia ou substitui:
```json
{ "arquivo_base64": "MIIK...", "senha": "••••" }
```
- Arquivo `.pfx`/`.p12` de até 100 KB, em base64. A senha e o arquivo **nunca** são devolvidos nem registrados.
- Resposta `200`: metadados (abaixo). Substituir mantém o anterior válido até o novo ser aceito.

`GET /empresas/{id}/certificado` — metadados do certificado ativo (`404` se não houver):
```json
{
  "titular": "VISTORIA EXEMPLO LTDA:11222333000181",
  "cnpj": "11222333000181",
  "emissor": "AC EXEMPLO",
  "numero_serie": "3A9F...",
  "valido_de": "2026-01-10T00:00:00-03:00",
  "valido_ate": "2027-01-10T00:00:00-03:00",
  "situacao": "valido",
  "dias_para_vencer": 66
}
```
`situacao`: `valido`, `vencendo` (30 dias ou menos), `vencido`.

| Erro (422) | Quando |
|---|---|
| `CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO` | senha incorreta ou arquivo inválido |
| `CERTIFICADO_SEM_CHAVE_PRIVADA` | arquivo sem chave privada (não é A1) |
| `CERTIFICADO_VENCIDO` | validade encerrada |
| `CERTIFICADO_AINDA_NAO_VALIDO` | validade ainda não começou |
| `CERTIFICADO_CNPJ_NAO_ENCONTRADO` | não é um e-CNPJ ICP-Brasil reconhecível |
| `CERTIFICADO_CNPJ_DIVERGENTE` | CNPJ do certificado diferente do da empresa |
