# Aba Pendências — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-11-05-pendencias-design.md`

## Global Constraints
- Toda action: `requireUser()`, limitador próprio (120/min), ids `Number.isInteger`, posse conferida no servidor; textos com `validateLabel`/`cleanNotes`.
- Nenhuma função auxiliar exportada de arquivo `"use server"`.
- Cores e componentes do tema atual (sem paleta nova).

## Review Focus
1. Checklist 1 de 4 → 25%, status `in_progress`; 4 de 4 → `done`.
2. Concluídas sempre no fim, em qualquer ordenação; estrelas primeiro na ordenação padrão.
3. Usuário B não lê/altera tarefas, itens, notas, compromissos, notas rápidas ou grupos de A.
4. Excluir grupo move as tarefas para o destino escolhido (ou nenhum), sem apagar tarefas.
5. "Hoje"/"Atrasada" pelo fuso do app, não pelo UTC do servidor.

### Task 1: Lógica pura (`src/lib/todos/logic.ts`) — progresso, status, indicadores, ordenação, busca, próximos prazos, calendário
### Task 2: Dados (`schema`, `drizzle/0003`, `src/lib/todos/store.ts`) com isolamento
### Task 3: Actions (`src/app/(app)/pendencias/actions.ts`) + testes de segurança
### Task 4: Tela (`/pendencias`) + menu
### Task 5: E2E e verificação no navegador
