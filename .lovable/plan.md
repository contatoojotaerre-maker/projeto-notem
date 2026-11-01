# notem — Formulário "Nova organização"

## Escopo
Somente o formulário de criação e a lista em Administração > Organizações. As funcionalidades da organização não mudam conforme o tipo.

## 1. Endereço no painel
- Renomear o campo "Endereço da organização" para "Endereço no painel".
- Gerado enquanto o nome é digitado: minúsculas, sem acentos, espaços e símbolos viram hífen, sem hífens repetidos ou nas pontas.
- Prévia do link completo abaixo do campo, ex.: `https://<origem>/o/onedesp`.
- Editável antes de criar. Depois de editado à mão, digitar no nome não sobrescreve mais o endereço.
- Continua imutável depois de criado (o bloqueio atual no banco é mantido).
- Unicidade: verificação ao sair do campo e na criação, com a mensagem "Este endereço já está em uso. Escolha outro." exibida junto ao campo. O banco continua sendo a garantia final.

## 2. Tipo de organização (obrigatório)
Duas opções selecionáveis, cada uma com descrição curta:
- **Sistema parceiro** — integra pela API e emite para as empresas clientes dele (ex.: OneDesp, VistoCash).
- **Empresa ou grupo** — emite notas para os próprios CNPJs (ex.: Grupo Jota).

Sem opção pré-selecionada; criar fica bloqueado até a escolha.

Banco: nova coluna `organizations.type` com os valores `partner` e `company`, obrigatória.
- Organizações já existentes: receberão `company` como valor inicial. Se alguma for parceira, o administrador da plataforma poderá alterá-la depois.
- Alteração posterior: somente administrador da plataforma. Proprietários e administradores da organização continuam podendo renomeá-la, mas não mudar o tipo (bloqueio no banco, não apenas na tela).
- Nesta fase não há tela de edição do tipo; a regra fica garantida no banco para quando ela existir.

## 3. Lista de organizações
- Nova coluna "Tipo" com o rótulo em português.
- Filtro acima da tabela: Todos / Sistema parceiro / Empresa ou grupo.
- Mensagem própria quando o filtro não encontra resultados.

## Detalhes técnicos
- Migração: enum `organization_type` (`partner`, `company`), coluna `type` NOT NULL com valor inicial `company` para linhas existentes; gatilho BEFORE UPDATE que rejeita mudança de `type` quando `is_platform_admin()` é falso.
- `createOrganization` passa a exigir `type` no validador; nova função autenticada para checar disponibilidade do endereço (respeitando RLS de admin da plataforma).
- Rótulos e função de geração do endereço em `src/lib/notem.ts`; alterar `src/routes/_authenticated/admin/organizacoes.tsx`.
- Testes: geração do endereço (acentos, espaços, hífens) e validação do tipo obrigatório.

## Validação
- Executar os testes.
- Conferir no banco que a coluna existe, as linhas antigas ficaram `company` e que um não-administrador da plataforma não consegue alterar o tipo.
- Conferir a tela: prévia do link, erro de duplicidade, filtro.
