# Dashboard de Carteira Cripto com Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Next.js local onde usuários criados por um admin fazem login e veem o dashboard da própria carteira cripto (saldo total, curva de capital, donut de alocação, tabela de ativos).

**Architecture:** Projeto Next.js único (App Router, Server Components + Server Actions). Lógica de domínio em módulos puros/testáveis em `src/lib/*` que recebem `db` e `now` como parâmetro; páginas em `src/app` só orquestram. SQLite via Drizzle; CoinGecko acessada apenas por `src/lib/prices`, com cache em tabela.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Recharts, Drizzle ORM + better-sqlite3, @node-rs/argon2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-dashboard-cripto-design.md`

## Global Constraints

- Banco: arquivo SQLite em `data/app.db` (sobrescrevível por env `DATABASE_PATH`); `data/` no `.gitignore`.
- Senhas: hash argon2 (`@node-rs/argon2`, sem build nativo no Windows). Mínimo 8 caracteres.
- Sessão: cookie `session`, `httpOnly`, `sameSite=lax`, `secure` só quando `process.env.COOKIE_SECURE === "true"`; id aleatório de 32 bytes (hex); validade 7 dias.
- Bloqueio: 5 falhas consecutivas → bloqueado por 15 minutos.
- Mensagem de erro de login: exatamente `Usuário ou senha inválidos`.
- CoinGecko: base URL em `COINGECKO_BASE_URL` (padrão `https://api.coingecko.com/api/v3`).
- Cache: preço atual 60 s, histórico 1 h, busca 24 h. Falha da API → usar último valor em cache mesmo expirado.
- Períodos: `7D` (pontos por hora), `30D` (a cada 4 h), `1A` e `Tudo` (por dia); `Tudo` = 365 dias, começando na data mais antiga em que todas as moedas têm preço.
- Formatação pt-BR: `US$ 48.230,12`; percentuais 2 casas; quantidades até 8 casas sem zeros à direita.
- Usernames: armazenados com `trim()` e em minúsculas; comparação sempre em minúsculas.
- Toda a UI em português; tema escuro.
- Lógica de domínio recebe `now: Date` como parâmetro (padrão `new Date()`) para ser testável.

## Review Focus

1. Quantidade digitada com vírgula (`0,5`) → aceita como 0.5 (Task 5, `parseQuantity`).
2. Username com espaços/maiúsculas (` Pedro `) → login funciona como `pedro`; criar `PEDRO` quando `pedro` existe → erro de duplicado (Task 4).
3. Adicionar moeda que o usuário já tem → atualiza a quantidade, não duplica (Task 5, `upsertHolding`).
4. Primeira execução sem internet / CoinGecko 429 sem cache → dashboard renderiza com `—`, sem erro 500 (Task 7 e Task 11).
5. Quantidades minúsculas (`0.00000001`) e totais grandes → formatação correta, sem notação científica (Task 6, `formatQty`).

---

## File Structure

```
src/
  db/schema.ts            tabelas Drizzle
  db/client.ts            createDb(path) + db singleton, aplica migrações
  lib/auth/password.ts    hashPassword / verifyPassword
  lib/auth/sessions.ts    createSession / validateSession / deleteSession / deleteUserSessions
  lib/auth/login.ts       attemptLogin (bloqueio)
  lib/auth/current.ts     getCurrentUser / requireUser / requireAdmin (cookies)
  lib/admin/users.ts      listUsers / createUser / resetPassword / deleteUser / changeOwnPassword
  lib/validation.ts       parseQuantity / validatePassword / normalizeUsername
  lib/holdings/holdings.ts listHoldings / upsertHolding / updateQuantity / deleteHolding
  lib/prices/cache.ts     cached()
  lib/prices/coingecko.ts chamadas HTTP cruas
  lib/prices/index.ts     getCurrentPrices / getHistory / searchCoins
  lib/portfolio/calc.ts   computePortfolio / buildCurve
  lib/format.ts           formatUsd / formatPct / formatQty
  app/login/              página + action de login
  app/(app)/layout.tsx    cabeçalho, exige login
  app/(app)/page.tsx      dashboard
  app/(app)/ativos/       página + actions
  app/(app)/admin/        página + actions
  app/(app)/conta/senha/  trocar senha
  components/dashboard/   BalanceCard, CapitalChart, AllocationDonut, HoldingsTable, StaleBanner
scripts/create-admin.ts
tests/                    Vitest (espelha src/lib)
e2e/                      Playwright + mock da CoinGecko
```

---

### Task 1: Scaffold, banco e infraestrutura de testes

**Files:**
- Create: projeto Next.js na raiz, `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/` (migrações geradas), `vitest.config.ts`, `tests/helpers/db.ts`, `tests/db/schema.test.ts`

**Interfaces:**
- Produces:
  - `createDb(path: string): Db` — abre SQLite, aplica migrações de `drizzle/`, retorna instância Drizzle tipada. `path` pode ser `":memory:"`.
  - `db: Db` — singleton com `process.env.DATABASE_PATH ?? "data/app.db"` (cria `data/` se não existir).
  - `type Db`
  - Tabelas `users`, `sessions`, `holdings`, `priceCache` (colunas conforme spec §5; `holdings.quantity` é `text`; unique em `(userId, coinId)`; `sessions` e `holdings` com `onDelete: "cascade"` para `users`). Datas como `integer` em ms (`mode: "timestamp_ms"`).
  - `tests/helpers/db.ts`: `testDb(): Db` → `createDb(":memory:")`.

- [ ] **Step 1: Scaffold.** A pasta já tem `docs/`, então gere em pasta temporária e copie:
  `npx create-next-app@latest ../_scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack`, depois mova o conteúdo (exceto `.git`) para a raiz e apague `../_scaffold`.
- [ ] **Step 2: Dependências.**
  `npm i drizzle-orm better-sqlite3 @node-rs/argon2 recharts` e `npm i -D drizzle-kit @types/better-sqlite3 vitest tsx @playwright/test`.
  `npx shadcn@latest init` (tema escuro, base neutral); adicionar componentes `button input label card table dialog dropdown-menu tabs sonner`.
  Adicionar ao `package.json`: `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"db:generate": "drizzle-kit generate"`, `"create-admin": "tsx scripts/create-admin.ts"`. Adicionar `data/` ao `.gitignore`. Forçar `<html className="dark" lang="pt-BR">` em `src/app/layout.tsx`.
- [ ] **Step 3: Teste que falha** em `tests/db/schema.test.ts`:
```ts
test("cria usuário e holding com cascade", () => {
  const db = testDb();
  const [u] = db.insert(users).values({ username: "a", passwordHash: "x", isAdmin: false }).returning().all();
  db.insert(holdings).values({ userId: u.id, coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity: "0.5" }).run();
  db.delete(users).where(eq(users.id, u.id)).run();
  expect(db.select().from(holdings).all()).toHaveLength(0);
});
test("holding é única por (userId, coinId)", () => { /* inserir 2x bitcoin p/ mesmo user → toThrow */ });
```
- [ ] **Step 4:** `npx vitest run tests/db` → FAIL (módulos inexistentes).
- [ ] **Step 5:** Implementar `schema.ts`, `client.ts` (ativar `PRAGMA foreign_keys = ON`), `drizzle.config.ts`; `npm run db:generate`.
- [ ] **Step 6:** `npx vitest run tests/db` → PASS. `npm run build` → sucesso.
- [ ] **Step 7: Commit** `feat: scaffold Next.js, schema SQLite e Vitest`

---

### Task 2: Senhas e sessões

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/sessions.ts`
- Test: `tests/auth/password.test.ts`, `tests/auth/sessions.test.ts`

**Interfaces:**
- Consumes: `Db`, tabelas `users`, `sessions`.
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000`
  - `createSession(db: Db, userId: number, now?: Date): { id: string; expiresAt: Date }`
  - `validateSession(db: Db, id: string, now?: Date): { id: number; username: string; isAdmin: boolean } | null` — sessão expirada é apagada e retorna `null`.
  - `deleteSession(db: Db, id: string): void`
  - `deleteUserSessions(db: Db, userId: number, exceptSessionId?: string): void`

- [ ] **Step 1: Testes que falham:**
  - `verifyPassword(await hashPassword("segredo123"), "segredo123")` → `true`; com `"errada"` → `false`; hash ≠ texto.
  - `createSession` gera id hex de 64 chars; `validateSession` com `now` = criação + 1 h → retorna usuário; com `now` = criação + 7 dias + 1 ms → `null` e a linha some da tabela.
  - `deleteUserSessions(db, u, keepId)` apaga todas exceto `keepId`.
- [ ] **Step 2:** `npx vitest run tests/auth` → FAIL.
- [ ] **Step 3:** Implementar (id via `crypto.randomBytes(32).toString("hex")`).
- [ ] **Step 4:** `npx vitest run tests/auth` → PASS.
- [ ] **Step 5: Commit** `feat: hash de senha e sessões`

---

### Task 3: Login com bloqueio

**Files:**
- Create: `src/lib/auth/login.ts`, `src/lib/validation.ts` (só `normalizeUsername` e `validatePassword` nesta task)
- Test: `tests/auth/login.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `createSession`.
- Produces:
  - `normalizeUsername(raw: string): string` → `raw.trim().toLowerCase()`
  - `validatePassword(pw: string): string | null` → mensagem `"A senha precisa ter pelo menos 8 caracteres"` ou `null`
  - `MAX_FAILED_ATTEMPTS = 5`, `LOCK_MS = 15 * 60 * 1000`
  - `attemptLogin(db: Db, username: string, password: string, now?: Date): Promise<{ ok: true; sessionId: string; expiresAt: Date } | { ok: false; reason: "invalid" | "locked" }>`
    - usuário inexistente → `invalid`; `lockedUntil > now` → `locked` (sem checar senha); senha errada → incrementa `failedAttempts`, ao chegar em 5 define `lockedUntil = now + 15min` e zera contador; sucesso → zera `failedAttempts` e `lockedUntil`, cria sessão.

- [ ] **Step 1: Testes que falham:**
  - login correto → `ok: true`; login com `" PEDRO "` para usuário `pedro` → `ok: true`.
  - senha errada → `{ ok: false, reason: "invalid" }`; usuário inexistente → `invalid`.
  - 5 erros seguidos → 6ª tentativa **com senha certa** → `locked`; mesma tentativa com `now` + 15 min + 1 ms → `ok: true`.
  - 4 erros, 1 acerto, 4 erros → não bloqueia (contador zerou).
  - `validatePassword("1234567")` → mensagem; `("12345678")` → `null`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run tests/auth tests/validation.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: login com bloqueio após 5 falhas`

---

### Task 4: Gestão de usuários + script do primeiro admin

**Files:**
- Create: `src/lib/admin/users.ts`, `scripts/create-admin.ts`
- Test: `tests/admin/users.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `deleteUserSessions`, `normalizeUsername`, `validatePassword`.
- Produces (todas retornam `{ ok: true } | { ok: false; error: string }` exceto `listUsers`):
  - `listUsers(db): { id; username; isAdmin; createdAt }[]`
  - `createUser(db, input: { username: string; password: string; isAdmin: boolean })` — erros: `"Usuário já existe"`, `"Usuário obrigatório"`, mensagem de `validatePassword`.
  - `resetPassword(db, userId: number, newPassword: string)` — encerra todas as sessões do usuário.
  - `deleteUser(db, actorId: number, targetId: number)` — erros: `"Você não pode remover a si mesmo"`, `"Não é possível remover o último administrador"`.
  - `changeOwnPassword(db, userId, currentSessionId, current: string, next: string)` — erro `"Senha atual incorreta"`; encerra as outras sessões.
- `scripts/create-admin.ts`: lê usuário e senha via `readline` (senha sem eco não é exigido), chama `createUser(db, {..., isAdmin: true})`, imprime resultado, `exit(1)` em erro.

- [ ] **Step 1: Testes que falham:** duplicado com caixa diferente (`pedro` / `PEDRO`) → erro; senha curta → erro; `resetPassword` apaga sessões; remover a si mesmo → erro; regras de remoção: 2 admins A e B, A remove B → ok; A tenta remover A → erro de si mesmo; com 1 admin A e usuário comum C, A remove C → ok; `deleteUser(db, C, A)` → `"Não é possível remover o último administrador"`; `changeOwnPassword` com senha atual errada → erro, com certa → mantém `currentSessionId` e apaga as outras.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run tests/admin` → PASS.
- [ ] **Step 5:** `DATABASE_PATH=data/dev.db npm run create-admin` manual → imprime `Administrador criado`.
- [ ] **Step 6: Commit** `feat: gestão de usuários e script create-admin`

---

### Task 5: Carteira (holdings) e validação de quantidade

**Files:**
- Create: `src/lib/holdings/holdings.ts`; Modify: `src/lib/validation.ts`
- Test: `tests/holdings/holdings.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `parseQuantity(raw: string): { ok: true; value: string } | { ok: false; error: string }` — aceita `0,5` e `0.5`, remove espaços, normaliza para string com ponto; rejeita vazio, não-número, `≤ 0`, mais de 18 casas: erro `"Informe uma quantidade maior que zero"` / `"Quantidade inválida"`.
  - `type Holding = { id: number; coinId: string; symbol: string; name: string; quantity: string }`
  - `listHoldings(db, userId): Holding[]`
  - `upsertHolding(db, userId, h: { coinId; symbol; name; quantity: string }): void` — se `(userId, coinId)` existe, atualiza quantidade.
  - `updateQuantity(db, userId, holdingId, quantity: string): boolean` — `false` se a holding não é do usuário.
  - `deleteHolding(db, userId, holdingId): boolean` — idem.

- [ ] **Step 1: Testes que falham:** `parseQuantity("0,5")` → `"0.5"`; `("1.234,5")` → erro `Quantidade inválida` (sem separador de milhar); `("0")`, `("-1")`, `("")`, `("abc")` → erro; `("0.00000001")` → ok. Upsert 2x bitcoin → 1 linha com a última quantidade. Usuário B chamando `updateQuantity`/`deleteHolding` na holding de A → `false` e dado de A intacto; `listHoldings(B)` não traz dados de A.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: carteira por usuário e validação de quantidade`

---

### Task 6: Formatação e cálculos do portfólio

**Files:**
- Create: `src/lib/format.ts`, `src/lib/portfolio/calc.ts`
- Test: `tests/format.test.ts`, `tests/portfolio/calc.test.ts`

**Interfaces:**
- Consumes: `Holding`.
- Produces:
  - `formatUsd(n: number): string` → `formatUsd(48230.12) === "US$ 48.230,12"` (`Intl.NumberFormat("pt-BR")` com prefixo manual `US$ `; normalizar espaço não-quebrável para espaço comum).
  - `formatPct(n: number): string` → `formatPct(0.6234) === "62,34%"`; `formatPct(-0.012) === "-1,20%"`.
  - `formatQty(q: string | number): string` → `"0.00000001"` → `"0,00000001"`; `"1.50000000"` → `"1,5"`; `"12345.5"` → `"12.345,5"`.
  - `type CurrentPrice = { usd: number; change24h: number | null }`
  - `type PortfolioRow = Holding & { price: number | null; value: number | null; share: number | null; change24h: number | null }`
  - `computePortfolio(holdings: Holding[], prices: Record<string, CurrentPrice>): { rows: PortfolioRow[]; total: number; change24hUsd: number; change24hPct: number | null }` — linhas sem preço têm `price/value/share = null` e não entram no total; `rows` ordenadas por `value` desc (nulos no fim); variação 24h do total = `Σ value - Σ value/(1+change24h/100)`.
  - `type Period = "7D" | "30D" | "1A" | "Tudo"`; `PERIOD_DAYS: Record<Period, number> = { "7D": 7, "30D": 30, "1A": 365, "Tudo": 365 }`; `PERIOD_STEP_MS = { "7D": 1h, "30D": 4h, "1A": 24h, "Tudo": 24h }`
  - `type PricePoint = [timestampMs: number, price: number]`
  - `buildCurve(holdings: Holding[], history: Record<string, PricePoint[]>, period: Period, now?: Date): { t: number; value: number }[]`

  Algoritmo de `buildCurve` (moedas sem histórico são ignoradas):
  ```
  start = max( now - PERIOD_DAYS*dia , max_i(primeiro timestamp da moeda i) )
  for t = start; t <= now; t += step:
     value(t) = Σ_i quantidade_i × (último preço da moeda i com timestamp ≤ t)
  ```

- [ ] **Step 1: Testes que falham:** formatação com os exemplos acima; `computePortfolio` com BTC 0.5 @ 60000 e ETH 2 @ 3000 → total 36000, shares 0.8333…/0.1666…, ordem BTC, ETH; moeda sem preço → `value: null`, fora do total; carteira vazia → `total 0`, `rows []`; `buildCurve` com 2 moedas onde a 2ª começa depois → primeiro ponto ≥ início da 2ª; passo do `30D` = 4 h; valor em um ponto = soma esperada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: formatação pt-BR e cálculos do portfólio`

---

### Task 7: Preços (CoinGecko + cache)

**Files:**
- Create: `src/lib/prices/cache.ts`, `src/lib/prices/coingecko.ts`, `src/lib/prices/index.ts`
- Test: `tests/prices/cache.test.ts`, `tests/prices/prices.test.ts`

**Interfaces:**
- Consumes: `Db`, `priceCache`, `CurrentPrice`, `PricePoint`, `Period`, `PERIOD_DAYS`.
- Produces:
  - `cached<T>(db, key: string, ttlMs: number, loader: () => Promise<T>, now?: Date): Promise<{ data: T; fetchedAt: Date; stale: boolean } | null>` — válido → retorna cache; expirado/ausente → chama loader e grava; loader lança e há cache → retorna cache com `stale: true`; loader lança sem cache → `null`.
  - `coingecko.ts` (usa `fetch` global e `COINGECKO_BASE_URL`; lança em status ≠ 200):
    - `fetchSimplePrices(ids: string[]): Promise<Record<string, CurrentPrice>>` → `GET /simple/price?ids=a,b&vs_currencies=usd&include_24hr_change=true`
    - `fetchMarketChart(id: string, days: number): Promise<PricePoint[]>` → `GET /coins/{id}/market_chart?vs_currency=usd&days={days}`, campo `prices`
    - `fetchSearch(query: string): Promise<{ id; symbol; name; thumb }[]>` → `GET /search?query=`, campo `coins` (máx. 10)
  - `index.ts`:
    - `getCurrentPrices(db, ids: string[], now?)` → `{ prices: Record<string, CurrentPrice>; fetchedAt: Date | null; stale: boolean }` (chave `price:${ids.sort().join(",")}`, TTL 60 s; `null` do cache → `prices: {}`)
    - `getHistory(db, ids: string[], period: Period, now?)` → `{ history: Record<string, PricePoint[]>; stale: boolean }` (uma chave por moeda `chart:${id}:${days}`, TTL 1 h; moeda que falhar sem cache fica ausente)
    - `searchCoins(db, query: string, now?)` (chave `search:${query.toLowerCase()}`, TTL 24 h; query < 2 chars → `[]`)

- [ ] **Step 1: Testes que falham** (mock com `vi.stubGlobal("fetch", ...)`): cache hit não chama loader; expirado chama loader; loader lança com cache → `stale: true`; sem cache → `null`. `getCurrentPrices` com fetch retornando 429 e sem cache → `{ prices: {}, stale: false, fetchedAt: null }` sem lançar. URL montada corretamente para `simple/price`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: cliente CoinGecko com cache e fallback`

---

### Task 8: Login, sessão na UI, layout e troca de senha

**Files:**
- Create: `src/lib/auth/current.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/actions.ts` (logout), `src/components/app-header.tsx`, `src/app/(app)/conta/senha/page.tsx` + `actions.ts`
- Delete: `src/app/page.tsx` do scaffold (substituída pelo dashboard na Task 11; até lá, colocar placeholder em `src/app/(app)/page.tsx` com o texto `Dashboard`).

**Interfaces:**
- Consumes: `attemptLogin`, `validateSession`, `deleteSession`, `changeOwnPassword`.
- Produces:
  - `getCurrentUser(): Promise<{ id; username; isAdmin; sessionId } | null>` (lê cookie `session`)
  - `requireUser()` → usuário ou `redirect("/login")`; `requireAdmin()` → usuário admin ou `redirect("/")`.
  - `loginAction(prev, formData)` → em sucesso grava cookie e `redirect("/")`; erro → `{ error: "Usuário ou senha inválidos" }` ou `{ error: "Muitas tentativas. Tente novamente em 15 minutos." }`.
  - `logoutAction()` → apaga sessão e cookie, `redirect("/login")`.

- [ ] **Step 1:** Implementar. Login: card centralizado, campos `Usuário`/`Senha`, botão `Entrar`, erro via `useActionState`. `/login` com sessão válida → `redirect("/")`. Header: logo, links Dashboard / Ativos / Admin (só admin), menu do usuário (Trocar senha, Sair).
- [ ] **Step 2: Verificação manual:** `npm run dev`; criar admin (Task 4); acessar `/` sem login → vai para `/login`; senha errada → mensagem exata; certa → header aparece; 5 erros → mensagem de bloqueio; Sair → volta ao login; trocar senha com senha atual errada → `Senha atual incorreta`.
- [ ] **Step 3:** `npm run build` e `npm test` → sucesso.
- [ ] **Step 4: Commit** `feat: telas de login, layout autenticado e troca de senha`

---

### Task 9: Página de administração

**Files:**
- Create: `src/app/(app)/admin/page.tsx`, `src/app/(app)/admin/actions.ts`, `src/app/(app)/admin/user-dialogs.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `listUsers`, `createUser`, `resetPassword`, `deleteUser`.

- [ ] **Step 1:** Implementar: tabela (Usuário, Admin, Criado em, ações). Diálogo "Novo usuário" (usuário, senha, checkbox admin). Diálogo "Redefinir senha". Botão "Remover" com confirmação. Toda action chama `requireAdmin()` primeiro e `revalidatePath("/admin")`; erros exibidos no diálogo/toast.
- [ ] **Step 2: Verificação manual:** criar usuário comum, logar com ele em outra janela anônima → não vê link Admin e `/admin` redireciona para `/`; tentar remover a si mesmo → mensagem de erro.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: página de administração de usuários`

---

### Task 10: Página de ativos

**Files:**
- Create: `src/app/(app)/ativos/page.tsx`, `src/app/(app)/ativos/actions.ts`, `src/app/(app)/ativos/add-asset-dialog.tsx`, `src/app/api/coins/search/route.ts`

**Interfaces:**
- Consumes: `requireUser`, `listHoldings`, `upsertHolding`, `updateQuantity`, `deleteHolding`, `parseQuantity`, `searchCoins`, `formatQty`.
- Produces: `GET /api/coins/search?q=` → JSON `{ id, symbol, name, thumb }[]` (exige sessão, 401 sem ela).

- [ ] **Step 1:** Implementar: lista (ícone/nome/símbolo, quantidade formatada, editar inline, remover com confirmação). Diálogo "Adicionar ativo": campo de busca com debounce 300 ms chamando a rota, lista de resultados, campo quantidade; se a moeda já existe, o diálogo mostra a quantidade atual e salvar atualiza. Erros de `parseQuantity` exibidos no campo. Actions usam sempre `user.id` da sessão, nunca do formulário.
- [ ] **Step 2: Verificação manual:** buscar `bit` → Bitcoin aparece; adicionar `0,5` → lista mostra `0,5`; adicionar Bitcoin de novo com `1` → continua 1 linha com `1`; quantidade `abc` → erro no campo.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: página de ativos com busca CoinGecko`

---

### Task 11: Dashboard

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Create: `src/components/dashboard/balance-card.tsx`, `capital-chart.tsx` (client), `allocation-donut.tsx` (client), `holdings-table.tsx` (client), `stale-banner.tsx`

**Interfaces:**
- Consumes: `requireUser`, `listHoldings`, `getCurrentPrices`, `getHistory`, `computePortfolio`, `buildCurve`, `formatUsd`, `formatPct`, `formatQty`, `Period`.

- [ ] **Step 1:** Implementar. Página lê `searchParams.periodo` (`7D|30D|1A|Tudo`, padrão `30D`, valor inválido → `30D`). Seletor de período são links (`?periodo=7D`). Componentes:
  - BalanceCard: `formatUsd(total)` e variação 24h em verde/vermelho (`▲`/`▼`).
  - CapitalChart: Recharts `AreaChart` com gradiente, tooltip com data e `formatUsd`; sem pontos → texto `Preços indisponíveis`.
  - AllocationDonut: `PieChart` com `innerRadius`, legenda com símbolo e `formatPct`; só linhas com `value`.
  - HoldingsTable: colunas Ativo | Quantidade | Preço | Valor US$ | % | 24h; ordenável por clique no cabeçalho; `—` para nulos; linha sem preço com badge `sem preço`.
  - StaleBanner: se `stale`, `Preços de X min atrás` (X a partir de `fetchedAt`).
  - Carteira vazia: card `Adicione seu primeiro ativo` com botão para `/ativos`.
- [ ] **Step 2: Verificação manual:** com 3 ativos, total = soma da tabela; % somam 100%; trocar períodos muda a curva; com `COINGECKO_BASE_URL=http://localhost:1` e banco novo → página abre com `—` e `Preços indisponíveis`, sem erro 500.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: dashboard com saldo, curva, donut e tabela`

---

### Task 12: Teste ponta a ponta

**Files:**
- Create: `playwright.config.ts`, `e2e/mock-coingecko.ts`, `e2e/global-setup.ts`, `e2e/flow.spec.ts`

**Interfaces:**
- Consumes: todas as telas; `createUser`; `createDb`.

- [ ] **Step 1:** `e2e/mock-coingecko.ts`: servidor `node:http` na porta 4010 respondendo `/api/v3/simple/price` (bitcoin 60000, change 1.5), `/api/v3/coins/bitcoin/market_chart` (30 pontos diários crescentes) e `/api/v3/search` (Bitcoin). `playwright.config.ts`: dois `webServer` — mock (`npx tsx e2e/mock-coingecko.ts`) e app (`npm run build && npm start` com `DATABASE_PATH=data/e2e.db`, `COINGECKO_BASE_URL=http://localhost:4010/api/v3`, porta 3100). `global-setup.ts`: apaga `data/e2e.db` e cria admin `admin`/`senha-forte-123`.
- [ ] **Step 2:** Teste `flow.spec.ts`: login errado → vê `Usuário ou senha inválidos`; login certo → dashboard vazio com `Adicione seu primeiro ativo`; `/ativos` → adicionar Bitcoin `0,5`; dashboard → saldo `US$ 30.000,00`, tabela com `BTC` e `100,00%`; clicar `7D` → URL contém `periodo=7D`; Sair → `/login`.
- [ ] **Step 3:** `npx playwright install chromium` e `npm run test:e2e` → PASS.
- [ ] **Step 4:** `npm test` → PASS (tudo).
- [ ] **Step 5:** Adicionar `README.md` com os 3 comandos da spec §9 e como acessar pela rede local (`npm start -- -H 0.0.0.0`).
- [ ] **Step 6: Commit** `test: fluxo ponta a ponta com CoinGecko simulada`
