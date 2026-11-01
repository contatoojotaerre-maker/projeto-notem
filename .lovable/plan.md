# notem — Fase 1: Fundação (plano)

## 1. Identidade visual
- Plus Jakarta Sans (300–700) carregada no `<head>`.
- Tokens de tema em `src/styles.css` (oklch), escuro padrão + claro:
  - Escuro: fundo Midnight, cartões Charcoal com vidro (blur + borda 8% branca), texto Branco/Cool Gray.
  - Claro: fundo Branco/Cool Gray, texto Midnight.
  - `--primary` = Electric Lime com `--primary-foreground` = Midnight; `--highlight` = Acid Yellow; `--glow-lime`, `--glow-cyan`.
  - Situação (fora da marca): `--status-success`, `--status-error`, `--status-warning`, `--status-neutral`, cada um com fundo suave.
  - Regra: lime só como preenchimento/indicador; no tema claro, nenhum texto em lime.
- Variantes: Button (`default` lime, `glass`, `ghost`), Card `glass`, Badge por situação.
- Logos/ícone/fundo de login: **não vieram anexados** — preciso dos 5 arquivos (logo escuro, logo claro, ícone, app icon/favicon, fundo do login).

## 2. Banco de dados (todas as tabelas com GRANT + RLS)

| Tabela | Campos principais |
|---|---|
| `profiles` | id (= auth.users), nome, avatar_url, tema (`escuro`/`claro`), ambiente (`producao`/`homologacao`), ultima_organizacao_id |
| `platform_admins` | user_id (único), criado_em, criado_por |
| `organizations` | nome, slug (único), criado_por, timestamps |
| `org_role` (enum) | proprietario, administrador, operador, leitura, desenvolvedor |
| `organization_members` | organization_id, user_id, papel, único (org, user) |
| `invitations` | organization_id, email (minúsculo), papel, status (pendente/aceito/revogado), convidado_por, aceito_em; único pendente por (org, email) |
| `municipios` | codigo_ibge (char 7, PK), nome, uf (char 2), uf_nome — vazia, você importa via CSV |
| `paises` | iso2 (char 2, PK), nome — vazia, CSV |
| `company_status` (enum) | em_configuracao (+ demais nas próximas fases) |
| `companies` | organization_id, cnpj (14 dígitos), razao_social, nome_fantasia, inscricao_municipal, email, telefone, cep, logradouro, numero, complemento, bairro, municipio_codigo_ibge (FK), uf, situacao (padrão em_configuracao), created_by, updated_by, created_at, updated_at, origem_alteracao (`painel`/`api`, padrão painel); **único (organization_id, cnpj)** |

- Validação de CNPJ (dígitos verificadores) em função SQL `is_valid_cnpj` usada num CHECK — vale também para a futura API — e repetida no formulário.
- Gatilhos: `updated_at`/`updated_by` automáticos; criação de `profiles` ao criar usuário; aceite de convite automático (cria membro e marca convite aceito quando o usuário entra com o e-mail convidado).
- Coluna `ambiente` será adicionada às tabelas futuras que dependerem dele; nada agora além da preferência.

## 3. Políticas de segurança
- Funções `SECURITY DEFINER`: `is_platform_admin(uid)`, `is_org_member(uid, org)`, `has_org_role(uid, org, papeis[])` — evitam recursão.
- `organizations`/`companies`/`organization_members`: leitura só para membros da organização **ou** admin da plataforma.
- `companies`: criar/editar por membros com papel ≠ leitura (detalhamento nas próximas fases) ou admin; exclusão só admin da plataforma.
- `organizations` e `invitations`: criação só por admin da plataforma nesta fase; edição da organização por Proprietário/Administrador.
- `platform_admins`: leitura só pelo próprio/admins; **nenhuma política de inserção** — ninguém se promove pelo app.
- `profiles`: cada um lê/edita o seu; papéis nunca ficam no profile.
- `municipios`/`paises`: leitura para usuários autenticados; escrita só via painel do Supabase.
- Frontend usa só a chave pública; ações privilegiadas (envio de convite) em funções de servidor que verificam o admin antes.

## 4. Primeiro administrador (mecanismo seguro)
Recomendo: você roda **uma linha de SQL** no SQL Editor do Supabase (acesso que só o dono do projeto tem):
`insert into platform_admins (user_id) select id from auth.users where email = 'seu@email';`
Não existe caminho pelo app; os próximos admins também só por SQL (ou por tela de admin numa fase futura, restrita a admins).

## 5. Login e convites
- Desativar cadastro público no Supabase (Authentication → Sign In / Providers → desligar "Allow new users to sign up"). Você faz isso no painel; eu indico o passo.
- Convite (admin da plataforma): cria registro em `invitations` e chama `inviteUserByEmail` no servidor → usuário recebe e-mail, define senha em `/definir-senha`.
- Google: como o usuário convidado já existe, entra normalmente com o mesmo e-mail; e-mails não convidados são recusados pelo Supabase e a tela mostra "Acesso não autorizado. Solicite um convite ao administrador da sua organização."
- "Lembrar de mim": sessão persistente quando marcado; senão, sessão só da aba.
- Recuperação: `/esqueci-senha` → e-mail → `/redefinir-senha`.
- Google exige configurar as credenciais OAuth no Google Cloud e no Supabase — passo a passo na entrega.

## 6. Telas
Públicas: `/entrar`, `/esqueci-senha`, `/redefinir-senha`, `/definir-senha`, `/` (redireciona conforme sessão).

Painel (protegido), estrutura `/o/$orgSlug/...`:
- Barra superior: seletor de organização, seletor Produção/Homologação (salvo no profile), busca visual, tema, menu do usuário.
- Faixa âmbar fixa em homologação.
- Menu lateral recolhível/responsivo: Início, Notas, Empresas, Modelos de serviço, Alertas, Integrações, Equipe*, Organização*, Ajuda (*só Proprietário/Administrador; bloqueado também na rota).
- **Empresas** (funcional): lista com busca por CNPJ/razão/fantasia e situação; cadastro/edição; detalhe com abas Dados (funcional) e Configuração fiscal, Certificado, Serviços, Prontidão, Sincronização ("Disponível em breve"). Município por busca na tabela oficial, UF preenchida a partir dele; máscaras de CNPJ/CEP/telefone, salvo só números.
- **Organização**: dados da organização (visualização/edição do nome).
- **Equipe**: lista de membros e papéis (sem convites pela tela).
- Demais: estado vazio "Disponível em breve".

Administração `/admin/...` (só admin da plataforma): **Organizações** funcional (listar, criar, convidar primeiro membro com e-mail + papel); Empresas e notas, Municípios, Mensagens de rejeição, Saúde do sistema, Cobrança em "Disponível em breve".
- Usuário sem organização vê tela "Você ainda não participa de nenhuma organização".

## 7. Componentes
AppShell, Sidebar, Topbar, OrgSwitcher, EnvironmentSwitcher, HomologBanner, ThemeToggle, UserMenu, ComingSoon, StatusBadge, GlassCard, CompanyForm, MunicipioCombobox, CnpjInput, InviteMemberDialog, CreateOrgDialog.

## 8. Testes
Validação de CNPJ, normalização (só números), regra de quem vê Equipe/Organização, e verificação de isolamento entre organizações (critério 5) consultando o banco como outro usuário.

## 9. Dúvidas e riscos
1. **Arquivos de marca** não chegaram — reenvie os 5 arquivos.
2. O projeto está ligado a um **Supabase próprio** (não Lovable Cloud): desligar cadastro público, configurar Google, URLs de redirecionamento e e-mails de convite são feitos por você no painel do Supabase.
3. URL com slug da organização (`/o/grupo-jota/empresas`) — ok, ou prefere só seletor sem slug na URL?
4. Papel "Leitura" pode ver empresas mas não editar — confirma já nesta fase?
5. E-mails do Supabase (convite/recuperação) virão no padrão em inglês até você personalizar os modelos no painel; posso fornecer os textos em português.
