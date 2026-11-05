# Dashboard fiduciário e moeda de referência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, escolhido pelo usuário). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aba "$" com contas em Real atualizadas à mão e seletor de moeda (USDT/BTC/BRL) nos dois dashboards.

**Architecture:** Mesmo app. Módulos novos puros/testáveis: `lib/fiat` (dados e cálculos), `lib/currency` (fatores, conversão, formatação), `lib/prices/rates` (cotações Binance). Páginas só orquestram.

**Spec:** `docs/superpowers/specs/2026-11-05-fiduciario-e-moeda-design.md`

## Global Constraints
- Toda action/página: `requireUser()`; ids do navegador validados (`Number.isInteger`) e posse conferida no servidor.
- Valores BRL como texto decimal com 2 casas; datas `AAAA-MM-DD` no fuso `APP_TIMEZONE` (padrão `America/Sao_Paulo`).
- Moedas: `type RefCurrency = "USDT" | "BTC" | "BRL"`; padrão Cripto USDT, $ BRL.
- Cookies de moeda: `moeda-cripto`, `moeda-fiat` (não httpOnly, `sameSite=lax`, 1 ano).
- Binance: pares `USDTBRL` e `BTCUSDT`; ticker 60 s, velas 1 h (722) e 1 d (367 e 1000), cache 1 h; mesma fila/pausa/timeout do cliente atual.

## Review Focus
1. Valor `5.230,50` → 5230.50; `5230.50` → 5230.50; `1.234.567` → 1234567 (parseBrl).
2. Dois saldos no mesmo dia → fica o último (upsert por conta+data).
3. Usuário B atualiza/renomeia/remove conta de A → recusado, dados de A intactos.
4. Binance sem cotação BRL → dashboard em moeda padrão com aviso, sem 500.
5. Moeda inválida na URL (`?moeda=EUR`) → usa cookie ou padrão.

---

### Task 1: Dados fiduciários
**Files:** `src/db/schema.ts`, `drizzle/0001_*.sql`, `src/lib/fiat/accounts.ts`, `src/lib/validation.ts` (parseBrl, validateAccountName, parseBalanceDate, todayIn), tests `tests/fiat/accounts.test.ts`, `tests/validation.test.ts`.
**Produces:** `listAccounts(db, userId): FiatAccount[]` (com último saldo e data), `listBalances(db, userId): Record<accountId, {date, amount}[]>`, `createAccount(db, userId, {name, amount, date})`, `setBalance(db, userId, accountId, {amount, date})`, `renameAccount(db, userId, accountId, name)`, `deleteAccount(db, userId, accountId)` — todos `{ok} | {ok:false,error}`; `MAX_ACCOUNTS = 50`.
- [ ] Testes (RED): parse de reais, datas, CRUD, mesmo dia substitui, limite, isolamento, nome duplicado.
- [ ] Implementar, `npm run db:generate`, GREEN, commit.

### Task 2: Cotações
**Files:** `src/lib/prices/binance.ts` (fetchPairTickers, fetchPairKlines com 1000), `src/lib/prices/rates.ts`, tests `tests/prices/rates.test.ts`.
**Produces:** `getRates(db, now)` → `{ usdtBrl, btcUsdt, fetchedAt, stale }` (números ou null); `getRateHistory(db, days: 30|365|1000, now)` → `{ usdtBrl: PricePoint[], btcUsdt: PricePoint[], oldestFetchedAt, stale }`.
- [ ] RED → GREEN → commit.

### Task 3: Moeda
**Files:** `src/lib/currency.ts`, tests `tests/currency.test.ts`.
**Produces:** `parseCurrency(raw, fallback)`, `factorFromUsdt(cur, rates)`, `factorFromBrl(cur, rates)`, `rateAt(points, t)`, `convertCurve(points, base, cur, history, current)`, `adjustChange(pct, fNow, fPast)`, `formatMoney(n, cur)`, `formatMoneyPrice(n, cur)`.
- [ ] RED → GREEN → commit.

### Task 4: Cálculos fiduciários
**Files:** `src/lib/fiat/calc.ts`, tests `tests/fiat/calc.test.ts`.
**Produces:** `FIAT_PERIODS` (30D, 6M, 1A, Tudo), `parseFiatPeriod`, `computeFiat(accounts, balances, now)` (total, linhas com %, 1M, 1A em BRL), `buildFiatCurve(balances, period, now)` (degraus diários).
- [ ] RED → GREEN → commit.

### Task 5: Meus ativos — seção Fiduciário
**Files:** `src/app/(app)/ativos/page.tsx`, `fiat-actions.ts`, `fiat-section.tsx`, tests `tests/fiat/actions.test.ts`.
- [ ] RED (actions recusam ids inválidos/alheios) → GREEN; verificação manual no navegador; commit.

### Task 6: Seletor de moeda + Cripto convertido + menu
**Files:** `src/components/currency-menu.tsx`, `src/lib/currency-cookie.ts`, `src/app/(app)/page.tsx`, componentes do dashboard (recebem `currency`), `period-selector.tsx` (preserva moeda), `app-header.tsx`.
- [ ] Verificação manual nas 3 moedas e com cotação indisponível; build; commit.

### Task 7: Dashboard $
**Files:** `src/app/(app)/fiduciario/page.tsx`, componentes reaproveitados.
- [ ] Verificação manual; build; commit.

### Task 8: E2E
**Files:** `e2e/mock-binance.ts` (USDTBRL, BTCUSDT), `e2e/flow.spec.ts`.
- [ ] Fluxo: criar conta, ver $ em R$, trocar Cripto para BRL. `npm run test:e2e` → PASS; commit.

### Task 9: Revisão de segurança e integridade
- [ ] Revisor independente na branch inteira; corrigir Critical/Important com teste RED→GREEN; suíte e e2e verdes; README atualizado; commit.
