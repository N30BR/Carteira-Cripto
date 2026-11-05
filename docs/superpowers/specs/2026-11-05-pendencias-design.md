# Aba Pendências — Design

**Data:** 2026-11-05
**Status:** design aprovado em conversa. Referências: `pendencias.png` e o prompt "Implementação da aba Pendências" do usuário. Login, isolamento por usuário, segurança e deploy seguem as specs anteriores.

## 1. Decisões do usuário
- Menu: Cripto · R$ · Faturas · Lançamentos · **Pendências** · Ativos · Admin.
- Cada pessoa tem as próprias pendências. Tema escuro atual; a imagem orienta só a organização (sem as cores âmbar).
- Categorias iniciais: **Profissional, Estudos, Financeiro, Casa**. Projetos começam vazios.
- Checkbox principal conclui a tarefa e todos os itens do checklist; desmarcar volta tudo para pendente.
- **Concluídas sempre no fim da lista**; ordenação padrão **Prioridade** (mais estrelas primeiro, empate pelo prazo mais próximo). Outras ordenações: prazo, criação, atualização, progresso — sempre com as concluídas no fim.
- Nota rápida que vira tarefa **some** das notas.

## 2. Dados (tabelas novas)
- **`todo_groups`**: `user_id`, `name` (1–40), `kind` (`category`|`project`), `created_at`. Único por (`user_id`, `kind`, `name`). Máx. 100.
- **`todo_tasks`**: `user_id`, `title` (1–120), `description` (0–5000), `category_id` e `project_id` (opcionais, `SET NULL`), `priority` (1–3, padrão 2), `due_date` (`AAAA-MM-DD`, opcional), `due_time` (`HH:MM`, opcional), `status` (`pending`|`in_progress`|`done`), `created_at`, `updated_at`. Máx. 2.000.
- **`todo_checklist`**: `task_id` (cascade), `text` (1–200), `done`, `position`. Máx. 50 por tarefa.
- **`todo_notes`**: `task_id` (cascade), `text` (1–1000), `created_at`. Máx. 50 por tarefa.
- **`todo_events`** (compromissos): `user_id`, `title` (1–120), `date`, `time` (opcional), `category_id` (opcional, `SET NULL`), `description` (0–2000), `status` (`scheduled`|`done`|`canceled`). Máx. 2.000.
- **`quick_notes`**: `user_id`, `text` (1–1000), `pinned`, `created_at`, `updated_at`. Máx. 500.
- Excluir grupo: as tarefas vão para outro grupo do mesmo tipo escolhido pelo usuário, ou ficam sem; nenhuma tarefa é apagada.

## 3. Regras
- **Progresso:** com checklist = itens feitos / total; sem checklist = 0% ou 100% (status `done`).
- **Status com checklist:** 0 feito → `pending` (ou `in_progress` se o usuário escolheu e nenhum item mudou depois); parte → `in_progress`; todos → `done`. Sem checklist: escolhido pelo usuário.
- Checkbox principal: marcar → `done` + todos os itens feitos; desmarcar → `pending` + todos os itens desfeitos.
- Prazo vencido nunca conclui a tarefa.
- **Indicadores** (data de hoje no fuso `APP_TIMEZONE`): Atrasadas (prazo < hoje, não concluída), Hoje (prazo = hoje, não concluída), Em andamento (status), Concluídas (status), Alta prioridade (3 estrelas, não concluída). Clicáveis como filtro (clicar de novo limpa).
- **Busca:** título, descrição, notas e itens do checklist (sem diferenciar maiúsculas/acentos).
- **Próximos prazos:** tarefas não concluídas com prazo e compromissos agendados; atrasadas primeiro, depois por data; até 8.
- Limite de alterações: 120/min por pessoa (próprio das pendências).

## 4. Tela `/pendencias`
- Título **Pendências** + subtítulo; 5 indicadores clicáveis.
- Barra: **Todas**, categorias cadastradas, **Projetos** (tarefas com projeto); busca.
- Três painéis (empilham no celular): **Categorias / Projetos** (contagem de não concluídas, criar/renomear/trocar tipo/excluir com destino), **Tarefas (n)** (ordenação, "+ Nova tarefa" só com título, cartões com checkbox, estrelas, etiqueta, prazo com "Atrasada/Hoje", barra de progresso, 2 itens do checklist + "+n itens"), **Detalhes da tarefa** (todos os campos editáveis, descrição, checklist "(x de y)" com % e ↑↓, notas adicionais, menu ⋯ com concluir/reabrir e excluir).
- Embaixo: **Prazos e compromissos** (calendário seg–dom com navegação, pontos nos dias com itens, hoje destacado, passados esmaecidos, clique no dia lista os itens; Próximos prazos; "+ Compromisso" com editar/excluir) e **Notas rápidas** (+, editar, excluir, fixar, virar tarefa).
- Estados vazios com orientação.

## 5. Testes
- Unidade: progresso/status, indicadores, ordenação (concluídas no fim, estrelas primeiro), busca, próximos prazos, calendário.
- Integração: CRUD com isolamento entre usuários para grupos, tarefas, checklist, notas, compromissos e notas rápidas; excluir grupo com destino; virar tarefa; limites.
- Ponta a ponta: criar tarefa com checklist, marcar itens, ver progresso e indicadores, concluir (vai para o fim), criar nota rápida e virar tarefa.
