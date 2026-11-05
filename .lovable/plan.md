# Redesenho do modal de endereço de webhook

## 1. Layout
- Largura do modal: de ~512 px para ~720 px (+40%), limitada a `calc(100vw - 2rem)`; sem rolagem horizontal (URLs longas quebram linha).
- Estrutura: cabeçalho fixo, conteúdo rolável, rodapé fixo com "Cancelar" e "Salvar". Altura máxima de 85% da tela.
- Duas colunas no desktop (a partir de ~768 px); uma coluna no celular.
  - Esquerda: seção "Destino" (URL HTTPS, Descrição), seção "Empresa", seção recolhível "Autorização (opcional)" com chave e cabeçalho. Abre sozinha se já houver chave configurada.
  - Direita: seção "Eventos".
- Exemplo curl continua no modal, abaixo das colunas, recolhível ("Exemplo do envio").
- Títulos de seção, espaçamento uniforme, ajudas de uma linha. Somente tokens do tema.

## 2. Empresa: um único campo
- Seletor com busca embutida (por nome ou CNPJ), valor inicial "Todas as empresas autorizadas". Lista só as empresas autorizadas da integração.

## 3. Eventos agrupados
- Três cartões selecionáveis:
  - "Notas de serviço (NFS-e)": `nota.*`
  - "Empresas e certificados": `empresa.situacao_alterada`, `certificado.vencendo`, `certificado.vencido` (assinatura do grupo: `empresa.*` + `certificado.*`)
  - "Municípios": `municipio.*`
- Cada cartão mostra o estado: "Grupo inteiro", "3 de 9 eventos" ou nada marcado.
- Link "Personalizar eventos" abre a lista do grupo (nome em português + código). Escolher individualmente troca o grupo por eventos avulsos; marcar todos volta a ser escolha individual (só o cartão assina o grupo).
- Texto fixo: "Teste da conexão (webhook.teste) é sempre incluído." Sem caixa de seleção; o teste já é entregue a todos os endereços.
- Pelo menos um grupo ou evento é obrigatório.

## Ponto de atenção: assinatura por grupo e "sem mudar regras do banco"
A assinatura por grupo não existe hoje. Para que um grupo receba eventos futuros, é preciso mudar a escolha dos destinatários na entrega. Proponho a mudança mínima abaixo, sem alterar o contrato de envio (envelope, cabeçalhos, assinatura, tentativas):
- Mesma coluna `events`, que passa a aceitar também os curingas `nota.*`, `empresa.*`, `certificado.*` e `municipio.*`.
- Na criação dos envios, um evento corresponde se o endereço assina o tipo exato **ou** o curinga do seu prefixo.
- Validação (tela, servidor e banco) aceita só tipos conhecidos ou esses curingas.
- Endereços existentes mantêm os eventos individuais e continuam funcionando sem migração de dados.
- Na lista de endereços, os grupos aparecem pelo nome ("Notas de serviço (NFS-e) — todos").

Se preferir não mexer no banco, a alternativa é o cartão apenas marcar os eventos atuais do grupo. Nesse caso eventos futuros **não** seriam incluídos automaticamente.

## 4. Documentação
- `docs/api/webhooks.md`: seção "Assinatura por grupo" com a tabela de grupos, curingas e eventos atuais, regra de correspondência, `webhook.teste` sempre entregue e compatibilidade com eventos individuais.
- `docs/api/openapi.yaml`: descrição do campo de eventos aceitando curingas.

## Testes
- Correspondência: tipo exato, curinga, evento novo de um grupo, sem correspondência.
- Validação: curinga desconhecido recusado.
- Estado dos cartões: grupo inteiro, parcial, vazio.

## Fora do escopo
Envelope, cabeçalhos, assinatura, cronograma de tentativas e demais regras ficam como estão; nada em `transmissor/`.
