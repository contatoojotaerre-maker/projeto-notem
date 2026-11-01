# notem — Marca e rotas públicas

## Escopo
Integrar os cinco arquivos de marca recebidos, unificar as páginas públicas em português e atualizar o guia de configuração. Nenhuma alteração na aplicação ou no banco será aplicada antes da aprovação deste plano.

## 1. Marca
- Usar `notem-fundo-login.png` como fundo da tela de acesso inteira, com cartão de vidro e formulário legível, sem o fundo geométrico e a composição dividida atuais.
- Substituir o nome textual pelo logo enviado, preservando proporções e transparência.
- No menu lateral expandido, alternar automaticamente entre `notem-logo-fundo-escuro.png` e `notem-logo-fundo-claro.png` conforme o tema salvo.
- No menu recolhido, usar `notem-icone-512.png` em vez de “n.”.
- Usar `notem-app-icon-512.png` para gerar o favicon de 64 × 64, sem deformação, e referenciá-lo no cabeçalho; remover o favicon padrão. O `favicon-64.png` extra não substituirá a origem solicitada: o app icon.
- Manter fonte, cores, preferência de tema e acessibilidade existentes.

## 2. Páginas públicas únicas
| Função | Endereço final |
|---|---|
| Login e retorno Google | `/entrar` |
| Solicitar recuperação | `/esqueci-senha` |
| Definir senha do convite | `/definir-senha` |
| Recuperar senha | `/redefinir-senha` |

- Remover as páginas `/auth` e `/reset-password`, sem criar aliases duplicados.
- `/` será apenas um redirecionamento para `/entrar`, não um segundo formulário. O login mantém o encaminhamento de uma sessão autorizada para o painel.
- Ajustar retorno Google, recuperação por e-mail, saída da conta, bloqueio de páginas privadas e links de retorno.
- Convites continuam retornando a `/definir-senha`.
- Links antigos de recuperação apontando para `/reset-password` precisarão ser solicitados novamente após esta mudança.

## 3. Redirect URLs finais no Supabase
Cadastrar estas URLs exatas para o preview:

```text
https://id-preview--24f0f935-7f21-4010-b7cf-276026256fea.lovable.app/entrar
https://id-preview--24f0f935-7f21-4010-b7cf-276026256fea.lovable.app/definir-senha
https://id-preview--24f0f935-7f21-4010-b7cf-276026256fea.lovable.app/redefinir-senha
```

Não é necessário cadastrar `/esqueci-senha`: ela solicita o e-mail, mas não recebe o retorno de autenticação.

Quando houver URL publicada, repetir os mesmos três caminhos nessa origem. Remover `/auth` e `/reset-password` da lista. A URI de callback do Google Cloud continua sendo a exibida no provedor Google do Supabase, não `/entrar` da notem.

O guia será entregue em uma nova versão com essas URLs. Esta lista descreve o resultado previsto; aguarde a aplicação aprovada antes de testar os novos retornos.

## 4. Verificação de RLS — já consultada, sem alterações
**Todas as oito tabelas do schema public estão com RLS ativo:**
- `companies`
- `countries`
- `invitations`
- `municipalities`
- `organization_members`
- `organizations`
- `platform_admins`
- `profiles`

RLS ativo não prova sozinho que todas as políticas estão corretas: os testes com usuários de organizações distintas continuam necessários. `FORCE ROW LEVEL SECURITY` não está ativo; isso não desativa RLS para os usuários comuns. Proprietários de tabela e papéis privilegiados podem ter exceções, por isso a chave privilegiada permanece fora do navegador.

### O que é rls_auto_enable
É uma função de gatilho administrativo que habilita RLS quando tabelas são criadas no schema public. Ela já existia antes das migrações da notem; pode aparecer num projeto novo porque o ambiente Supabase pode trazer essa automação de proteção preconfigurada. Não é uma tabela da notem, nem sinal de dados expostos por si só.

### Por que o aviso aparece
A consulta confirmou que a função usa `SECURITY DEFINER` e tem permissão `EXECUTE` para `anon` e `authenticated`. O verificador sinaliza essa combinação porque ela executa com os privilégios de seu proprietário. Neste caso, retorna `event_trigger` e usa operações específicas do evento DDL: não é uma função de negócio normal que o navegador possa chamar livremente como uma consulta comum.

### Exige ação?
Não exige desativar RLS, excluir a função ou bloquear a configuração do login. Há uma melhoria de segurança recomendável: revogar a execução por `PUBLIC`, `anon` e `authenticated`, preservando o gatilho administrativo. Essa alteração não será aplicada neste pedido, que solicita explicação e confirmação; pode ser aprovada separadamente. O aviso específico pode permanecer até a revogação.

## 5. Detalhes técnicos e arquivos
- Criar ponteiros CDN em `src/assets/` para os cinco arquivos gráficos, sem deixar originais binários no repositório; favicon local é a exceção.
- Criar `src/components/notem/brand.tsx` para compartilhar logo/ícone sem importar a tela de login no menu lateral.
- Alterar `src/components/notem/auth-screen.tsx`, `src/components/notem/app-shell.tsx` e `src/styles.css` para integrar a marca e padronizar endereços.
- Alterar `src/routes/__root.tsx` para favicon e `src/routes/index.tsx` para redirecionamento.
- Manter as quatro rotas em português; remover `src/routes/auth.tsx` e `src/routes/reset-password.tsx`.
- Ajustar o destino do bloqueio em `src/routes/_authenticated/route.tsx`; preservar validação de usuário e proteção dos dados.
- Preservar os metadados específicos de cada página; não editar a árvore de rotas gerada.
- Atualizar o teste de navegação com os quatro caminhos existentes e ausência das duas páginas removidas.
- Entregar `notem-guia-fase-1_v2.md`, preservando o guia anterior.

## 6. Validação após aprovação
- Executar os testes de navegação e as regras existentes.
- Conferir o fundo, proporções dos logos, ícone recolhido e favicon.
- Verificar login e recuperação em desktop e celular, sem sobreposição ou rolagem horizontal.
- Confirmar que acesso privado sem sessão vai a `/entrar`, `/` redireciona e os caminhos removidos não exibem páginas duplicadas.
- Conferir redirecionamentos do Google e dos e-mails no código; teste real permanece dependente da configuração externa.

## Fora do escopo
Não importar os CSV enviados nem modificar seus dados neste pedido; a importação segue sob seu controle. Não configurar provedores Google/Supabase, enviar e-mails ou alterar permissões do banco sem solicitação correspondente.
