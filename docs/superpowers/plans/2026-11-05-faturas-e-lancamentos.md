# Faturas e Lançamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-11-05-faturas-e-lancamentos-design.md`

## Global Constraints
- Valores em centavos (inteiros) nas compras/parcelas; meses `AAAA-MM`; datas `AAAA-MM-DD`.
- Toda action: `requireUser()`, `allowFiatChange(user.id)` (limite compartilhado), ids `Number.isInteger`, posse conferida no servidor.
- Nada de função auxiliar exportada em arquivo `"use server"`.
- Cores: Cartão PF `#28A38C`, Cartão PJ `#9470E7`.

## Review Focus
1. R$ 100,00 em 3× → 33,33 / 33,33 / 33,34 (soma exata).
2. "6/12" com referência 2025-05 → 1ª fatura 2024-12; parcelas 1–5 pagas, 6 com status escolhido, 7–12 pendentes.
3. Editar de 12 para 6 parcelas preserva `paid` de 1–6 e remove 7–12.
4. Usuário B não lê/edita/exclui compras, parcelas ou categorias de A.
5. Excluir categoria em uso → compras ficam "Sem categoria", nada some.

### Task 1: Ajustes (Cripto 1S/1M/6M, R$ 2M/3M, menu R$, cores dos tokens)
- [ ] Testes RED (parsePeriod aceita 1S/1M e 7D/30D antigos; periodChanges inclui 6M; computeFiat inclui 2M/3M; coinColor) → GREEN; telas; commit.

### Task 2: Dados e regras dos cartões
**Files:** `src/db/schema.ts`, `drizzle/0002_*`, `src/lib/cards/months.ts`, `src/lib/cards/installments.ts`, `src/lib/cards/store.ts`, `src/lib/cards/categories.ts`, tests `tests/cards/*`.
- [ ] RED → GREEN → commit.

### Task 3: Agregações
**Files:** `src/lib/cards/summary.ts`, tests.
**Produces:** `monthRows`, `monthTotals`, `monthlySeries`, `categoryBreakdown`, `projection`.
- [ ] RED → GREEN → commit.

### Task 4: Tela Lançamentos (+ actions com testes de isolamento)
- [ ] RED (actions) → GREEN; verificação manual; commit.

### Task 5: Tela Faturas
- [ ] Verificação manual (invariantes na tela); build; commit.

### Task 6: E2E e revisão de segurança
- [ ] E2E do fluxo; revisor independente; correções RED→GREEN; README; commit.
