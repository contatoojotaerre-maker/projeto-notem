---
titulo: Entregas e reenvios
ordem: 4
atualizado: 2026-11-17
descricao: Resposta esperada, cronograma de novas tentativas, desativação automática e cuidados de segurança.
---

# Entregas e reenvios

## Resposta esperada e reenvios
- Responda **2xx em até 10 segundos**. Processe de forma assíncrona se precisar de mais tempo.
- Qualquer outra resposta, erro de conexão ou tempo esgotado é falha. A notem tenta novamente com intervalos crescentes: **1 min, 5 min, 30 min, 2 h, 6 h, 12 h e 24 h** (8 tentativas no total).
- **Envio de teste pelo painel:** a notem faz uma tentativa (até 10 segundos) e mostra o resultado na tela (HTTP e tempo, ou o motivo). Se falhar, a entrega segue o mesmo cronograma de novas tentativas.
- **Eventos reais:** o envio começa logo após o evento ou pelo processamento automático em até cerca de 1 minuto.
- Depois de esgotadas as tentativas, a entrega aparece como **Esgotada** no painel (Integrações › Webhooks) e pode ser reenviada manualmente por lá.
- Se um endereço falhar continuamente por **3 dias**, ele é **desativado automaticamente** e a organização é avisada no painel.

## Segurança
- Nunca confie no conteúdo sem validar a assinatura.
- O webhook **avisa**; para ações sensíveis, confirme o estado consultando a API.
- Mensagens nunca contêm certificados, senhas ou chaves.
