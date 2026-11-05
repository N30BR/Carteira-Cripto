# Dashboard de Carteira Cripto com Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Next.js hospedado no Easypanel onde usuários criados por um admin fazem login e veem o dashboard da própria carteira cripto (saldo total, curva de capital, donut de alocação, tabela de ativos).

**Architecture:** Projeto Next.js único (App Router, Server Components + Server Actions). Lógica de domínio em módulos testáveis em `src/lib/*` que recebem `db` e `now` como parâmetro; páginas em `src/app` só orquestram e sempre chamam `requireUser`/`requireAdmin`. SQLite via Drizzle; CoinGecko acessada apenas por `src/lib/prices`, com cache em tabela. Docker `standalone` com volume em `/app/data`.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Recharts, Drizzle ORM + better-sqlite3, @node-rs/argon2, Vitest, Playwright, Docker (Easypanel).

**Spec:** `docs/superpowers/specs/2026-11-05-dashboard-cripto-design.md`

## Global Constraints

- Banco: `DATABASE_PATH` (padrão `data/app.db`, relativo ao cwd); `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`; `data/` no `.gitignore`. Conexão aberta só no primeiro uso (`getDb()`), nunca na importação.
- Senhas: `@node-rs/argon2`; 8–256 caracteres.
- Username: 3–32 chars `^[a-z0-9._-]+$` após `trim().toLowerCase()`.
- Sessão: id aleatório 32 bytes hex no cookie; no banco só `sha256(id)` hex; validade 7 dias. `secure = NODE_ENV === "production" && COOKIE_SECURE !== "false"`; nome `__Host-session` se secure, senão `session`; `httpOnly`, `sameSite=lax`, `path=/`.
- Bloqueio: 5 falhas consecutivas → 15 min; tentativas durante bloqueio não contam.
- Mensagens exatas: credencial inválida **ou bloqueada** → `Usuário ou senha inválidos`; limite de IP → `Muitas tentativas. Tente novamente em 15 minutos.`
- Limite por IP: 20 falhas / 15 min, em memória; IP = N-ésimo valor da direita do `x-forwarded-for`, N = `TRUSTED_PROXY_HOPS` (padrão 1); sem cabeçalho → limite não se aplica.
- CoinGecko: `COINGECKO_BASE_URL` (padrão `https://api.coingecko.com/api/v3`), header `x-cg-demo-api-key: $COINGECKO_API_KEY` quando definido; máx. 2 requisições simultâneas; 429 → 1 nova tentativa após 2 s.
- Cache: preço atual 60 s, histórico 1 h, busca 24 h; falha → cache expirado com `stale: true`.
- Períodos: `7D` (passo 1 h, dados de `days=30`), `30D` (passo 4 h, `days=30`), `1A` (passo 24 h, `days=365`); padrão `30D`.
- Formatação pt-BR: `US$ 48.230,12`; percentuais 2 casas; quantidades até 8 casas, sem zeros à direita, sem notação científica.
- Limites: 100 ativos por usuário; 30 buscas por usuário por minuto; termo de busca 2–50 chars.
- Toda a UI em português; tema escuro.
- Lógica de domínio recebe `now: Date` (padrão `new Date()`).

## Review Focus

1. Quantidade com vírgula (`0,5`) → aceita como 0.5 (Task 5, `parseQuantity`).
2. Username com espaços/maiúsculas (` Pedro `) → login funciona como `pedro`; criar `PEDRO` com `pedro` existente → `Usuário já existe` (Task 4).
3. Adicionar moeda que o usuário já tem → atualiza, não duplica (Task 5).
4. CoinGecko 429/sem internet e sem cache → dashboard renderiza com `—`, sem erro 500 (Tasks 7 e 11).
5. `x-forwarded-for` forjado (`1.2.3.4, 10.0.0.1`) → limite usa `10.0.0.1`, não `1.2.3.4` (Task 3).

---

## File Structure

```
src/
  db/schema.ts             tabelas Drizzle
  db/client.ts             createDb(path) / getDb()
  instrumentation.ts       ensureBootstrapAdmin no start
  lib/auth/password.ts     hashPassword / verifyPassword
  lib/auth/sessions.ts     createSession / validateSession / deleteSession / deleteUserSessions
  lib/auth/login.ts        attemptLogin / recordFailure (bloqueio)
  lib/auth/ip-limit.ts     clientIp / ipLimited / recordIpFailure
  lib/auth/cookie.ts       sessionCookieName / sessionCookieOptions
  lib/auth/current.ts      getCurrentUser / requireUser / requireAdmin
  lib/admin/users.ts       listUsers / createUser / resetPassword / unlockUser / deleteUser / changeOwnPassword / ensureBootstrapAdmin
  lib/validation.ts        normalizeUsername / validateUsername / validatePassword / parseQuantity / normalizeSearch
  lib/rate-limit.ts        createWindowLimiter (genérico, em memória)
  lib/holdings/holdings.ts listHoldings / upsertHolding / updateQuantity / deleteHolding
  lib/prices/cache.ts      cached / pruneExpired
  lib/prices/coingecko.ts  HTTP cru + fila de concorrência
  lib/prices/index.ts      getCurrentPrices / getHistory / searchCoins
  lib/portfolio/calc.ts    computePortfolio / buildCurve
  lib/format.ts            formatUsd / formatPct / formatQty
  app/login/               página + action
  app/(app)/layout.tsx     cabeçalho
  app/(app)/page.tsx       dashboard
  app/(app)/ativos/        página + actions
  app/(app)/admin/         página + actions
  app/(app)/conta/senha/   trocar senha
  app/api/coins/search/    rota de busca
  components/dashboard/    BalanceCard, CapitalChart, AllocationDonut, HoldingsTable, StaleBanner
scripts/create-admin.ts    (dev)
scripts/backup.mjs         (produção)
docker/entrypoint.sh
Dockerfile, .dockerignore, README.md
tests/                     Vitest
e2e/                       Playwright + mock CoinGecko
```

---

### Task 1: Scaffold, banco e infraestrutura de testes

**Files:**
- Create: projeto Next.js na raiz, `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/`, `vitest.config.ts`, `tests/helpers/db.ts`, `tests/db/schema.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces:
  - `createDb(path: string): Db` — abre SQLite, aplica pragmas e migrações de `path.join(process.cwd(), "drizzle")`. Aceita `":memory:"`. Cria a pasta do arquivo se faltar.
  - `getDb(): Db` — singleton preguiçoso com `process.env.DATABASE_PATH ?? "data/app.db"`.
  - `type Db`
  - Tabelas: `users` (`id`, `username` unique, `passwordHash`, `isAdmin`, `createdAt`, `failedAttempts` default 0, `lockedUntil` nullable), `sessions` (`idHash` pk, `userId`, `expiresAt`), `holdings` (`id`, `userId`, `coinId`, `symbol`, `name`, `quantity` text, `updatedAt`; unique `(userId, coinId)`), `priceCache` (`key` pk, `payload` text, `fetchedAt`, `expiresAt`). FKs com `onDelete: "cascade"`. Datas `integer` `mode: "timestamp_ms"`.
  - `tests/helpers/db.ts`: `testDb(): Db` → `createDb(":memory:")`.

- [ ] **Step 1: Scaffold.** A pasta já tem `docs/` e `.git`; gerar em pasta temporária e mover: `npx create-next-app@latest ../_scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack`, mover tudo exceto `.git` para a raiz, apagar `../_scaffold`.
- [ ] **Step 2: Dependências.** `npm i drizzle-orm better-sqlite3 @node-rs/argon2 recharts` e `npm i -D drizzle-kit @types/better-sqlite3 vitest tsx @playwright/test`. `npx shadcn@latest init` (neutral) + `npx shadcn@latest add button input label card table dialog dropdown-menu sonner badge checkbox`. Scripts: `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"db:generate": "drizzle-kit generate"`, `"create-admin": "tsx scripts/create-admin.ts"`. `.gitignore` += `data/`. `src/app/layout.tsx`: `<html lang="pt-BR" className="dark">`. `next.config.ts`: `output: "standalone"`, `serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"]`, e `experimental.serverActions.allowedOrigins = process.env.APP_DOMAIN ? [process.env.APP_DOMAIN] : undefined`.
- [ ] **Step 3: Testes que falham** em `tests/db/schema.test.ts`:
```ts
test("remover usuário apaga holdings e sessões (cascade)", () => {
  const db = testDb();
  const [u] = db.insert(users).values({ username: "a", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all();
  db.insert(holdings).values({ userId: u.id, coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity: "0.5", updatedAt: new Date() }).run();
  db.delete(users).where(eq(users.id, u.id)).run();
  expect(db.select().from(holdings).all()).toHaveLength(0);
});
test("holding é única por (userId, coinId)", () => { /* 2º insert de bitcoin p/ mesmo user → toThrow */ });
```
- [ ] **Step 4:** `npx vitest run tests/db` → FAIL.
- [ ] **Step 5:** Implementar `schema.ts`, `client.ts`, `drizzle.config.ts`; `npm run db:generate`.
- [ ] **Step 6:** `npx vitest run tests/db` → PASS; `npm run build` → sucesso, sem criar `data/app.db` durante o build.
- [ ] **Step 7: Commit** `feat: scaffold Next.js, schema SQLite e Vitest`

---

### Task 2: Senhas e sessões

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/sessions.ts`, `src/lib/auth/cookie.ts`
- Test: `tests/auth/password.test.ts`, `tests/auth/sessions.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`, `DUMMY_HASH: Promise<string>` (hash fixo calculado uma vez, para tempo constante).
  - `SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000`
  - `createSession(db, userId: number, now?): { token: string; expiresAt: Date }` — `token` vai no cookie; grava `sha256(token)`.
  - `validateSession(db, token: string, now?): { id: number; username: string; isAdmin: boolean; sessionHash: string } | null` — expirada é apagada.
  - `deleteSession(db, token: string): void`
  - `deleteUserSessions(db, userId: number, exceptHash?: string): void`
  - `cookie.ts`: `sessionCookieName(): string`, `sessionCookieOptions(expiresAt: Date)` conforme Global Constraints.

- [ ] **Step 1: Testes que falham:** verify certo/errado; `createSession` → token hex de 64 chars e a tabela **não** contém o token puro (contém `sha256(token)`); válido em +1 h; `null` e linha apagada em +7 dias +1 ms; `deleteUserSessions(db, u, keepHash)` mantém só aquela; `sessionCookieName()` com `NODE_ENV=production` → `__Host-session`, com `COOKIE_SECURE=false` → `session`.
- [ ] **Step 2:** `npx vitest run tests/auth` → FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: hash de senha e sessões com id em hash`

---

### Task 3: Validação, login com bloqueio e limite por IP

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/rate-limit.ts`, `src/lib/auth/login.ts`, `src/lib/auth/ip-limit.ts`
- Test: `tests/validation.test.ts`, `tests/auth/login.test.ts`, `tests/auth/ip-limit.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `DUMMY_HASH`, `createSession`.
- Produces:
  - `normalizeUsername(raw): string`; `validateUsername(u): string | null` (`"Usuário deve ter 3 a 32 caracteres: letras, números, . _ -"`); `validatePassword(pw): string | null` (`"A senha precisa ter entre 8 e 256 caracteres"`).
  - `createWindowLimiter(max: number, windowMs: number): { hit(key: string, now?: Date): void; limited(key: string, now?: Date): boolean; reset(): void }` — conta eventos por chave numa janela deslizante.
  - `MAX_FAILED_ATTEMPTS = 5`, `LOCK_MS = 15 * 60 * 1000`
  - `recordFailure(db, userId: number, now?): void` — incrementa; ao chegar em 5 define `lockedUntil = now + LOCK_MS` e zera o contador.
  - `attemptLogin(db, username, password, now?): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false }>` — inexistente → roda `verifyPassword(await DUMMY_HASH, password)` e falha; bloqueado → falha sem verificar e sem contar; senha errada → `recordFailure`; sucesso → zera contador/bloqueio e cria sessão.
  - `ip-limit.ts`: `clientIp(xff: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null` (divide por vírgula com `trim`; retorna o N-ésimo valor a partir da direita; se houver menos de N valores, retorna o primeiro; cabeçalho ausente/vazio → `null`); `ipLimited(ip: string | null, now?)`; `recordIpFailure(ip: string | null, now?)` — 20 falhas / 15 min; `ip null` → nunca limitado.

- [ ] **Step 1: Testes que falham:**
  - `clientIp("1.2.3.4, 10.0.0.1", 1)` → `"10.0.0.1"`; `clientIp("9.9.9.9", 1)` → `"9.9.9.9"`; `clientIp("1.1.1.1, 2.2.2.2, 3.3.3.3", 2)` → `"2.2.2.2"`; `clientIp(null)` → `null`.
  - 20 `recordIpFailure("x")` → `ipLimited("x")` true; outro IP → false; +15 min +1 ms → false; `ipLimited(null)` sempre false.
  - login certo → ok; `" PEDRO "` → ok; senha errada → `{ ok: false }`; inexistente → `{ ok: false }`.
  - 5 erros → 6ª **com senha certa** → `{ ok: false }` e `failedAttempts` não muda; em +15 min +1 ms → ok.
  - 4 erros, 1 acerto, 4 erros → não bloqueia.
  - `validateUsername("ab")`, `("a b c")` → erro; `("pedro.h")` → null. `validatePassword("1234567")` e `("x".repeat(257))` → erro.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run tests/auth tests/validation.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: login com bloqueio, tempo constante e limite por IP`

---

### Task 4: Gestão de usuários e primeiro admin

**Files:**
- Create: `src/lib/admin/users.ts`, `scripts/create-admin.ts`, `src/instrumentation.ts`
- Test: `tests/admin/users.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `deleteUserSessions`, `recordFailure`, validações.
- Produces (retornam `{ ok: true } | { ok: false; error: string }`, exceto `listUsers`):
  - `listUsers(db): { id; username; isAdmin; createdAt; lockedUntil: Date | null }[]`
  - `createUser(db, { username, password, isAdmin })` — erros: `"Usuário já existe"`, mensagens de `validateUsername`/`validatePassword`.
  - `resetPassword(db, userId, newPassword)` — também zera `failedAttempts`/`lockedUntil` e encerra todas as sessões.
  - `unlockUser(db, userId)` — zera `failedAttempts`/`lockedUntil`.
  - `deleteUser(db, actorId, targetId)` — erros `"Você não pode remover a si mesmo"`, `"Não é possível remover o último administrador"`.
  - `changeOwnPassword(db, userId, currentHash: string, current, next, now?)` — conta bloqueada → `"Muitas tentativas. Tente novamente em 15 minutos."`; senha atual errada → `recordFailure` + `"Senha atual incorreta"`; sucesso → encerra as outras sessões.
  - `ensureBootstrapAdmin(db, env = process.env): "created" | "skipped"` — cria admin de `ADMIN_USERNAME`/`ADMIN_PASSWORD` só se não houver nenhum usuário; loga `Administrador inicial criado: <usuario>` (sem a senha).
  - `src/instrumentation.ts`: `register()` → se `process.env.NEXT_RUNTIME === "nodejs"`, `await import` e chama `ensureBootstrapAdmin(getDb())`.
  - `scripts/create-admin.ts`: `readline` pergunta usuário e senha, `createUser(..., isAdmin: true)`, imprime `Administrador criado` ou o erro e `exit(1)`.

- [ ] **Step 1: Testes que falham:** `pedro`/`PEDRO` → `Usuário já existe`; senha curta → erro; `resetPassword` apaga sessões e desbloqueia; `unlockUser` desbloqueia; 2 admins A e B: A remove B → ok, A remove A → erro de si mesmo; 1 admin A + comum C: `deleteUser(db, C, A)` → erro de último admin; `changeOwnPassword` errada 5x → 6ª com senha certa → erro de bloqueio; certa → mantém `currentHash`, apaga as outras; `ensureBootstrapAdmin` com banco vazio + envs → `created`; com usuário existente → `skipped`; sem envs → `skipped`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run tests/admin` → PASS.
- [ ] **Step 5:** Manual: `npm run create-admin` com `DATABASE_PATH=data/dev.db` → `Administrador criado`.
- [ ] **Step 6: Commit** `feat: gestão de usuários, desbloqueio e admin inicial`

---

### Task 5: Carteira (holdings) e validação de quantidade

**Files:**
- Create: `src/lib/holdings/holdings.ts`; Modify: `src/lib/validation.ts`
- Test: `tests/holdings/holdings.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `parseQuantity(raw): { ok: true; value: string } | { ok: false; error: string }` — aceita `0,5`/`0.5`, remove espaços, normaliza para ponto; erros `"Quantidade inválida"` (não-número, separador de milhar, >18 casas) e `"Informe uma quantidade maior que zero"` (≤ 0).
  - `normalizeSearch(raw): string | null` — `trim().toLowerCase()`, 2–50 chars senão `null`.
  - `MAX_HOLDINGS = 100`
  - `type Holding = { id: number; coinId: string; symbol: string; name: string; quantity: string }`
  - `listHoldings(db, userId): Holding[]`
  - `upsertHolding(db, userId, h: { coinId; symbol; name; quantity }): { ok: true } | { ok: false; error: string }` — atualiza se existe; nova acima de 100 → `"Limite de 100 ativos atingido"`.
  - `updateQuantity(db, userId, holdingId, quantity): boolean`, `deleteHolding(db, userId, holdingId): boolean` — `false` se não for do usuário.

- [ ] **Step 1: Testes que falham:** `parseQuantity("0,5")` → `"0.5"`; `("1.234,5")`, `("abc")`, `("")` → `Quantidade inválida`; `("0")`, `("-1")` → maior que zero; `("0.00000001")` → ok. Upsert 2x bitcoin → 1 linha com a última quantidade. 101ª moeda → erro de limite. B atualizando/removendo holding de A → `false`, A intacto; `listHoldings(B)` vazio.
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
  - `formatUsd(n)` → `formatUsd(48230.12) === "US$ 48.230,12"` (prefixo manual `US$ `, espaço comum).
  - `formatPct(n)` → `formatPct(0.6234) === "62,34%"`, `formatPct(-0.012) === "-1,20%"`.
  - `formatQty(q: string | number)` → `"0.00000001"` → `"0,00000001"`; `"1.50000000"` → `"1,5"`; `"12345.5"` → `"12.345,5"`; `"0.123456789"` → `"0,12345679"`.
  - `type CurrentPrice = { usd: number; change24h: number | null }`
  - `type PortfolioRow = Holding & { price: number | null; value: number | null; share: number | null; change24h: number | null }`
  - `computePortfolio(holdings, prices: Record<string, CurrentPrice>): { rows: PortfolioRow[]; total: number; change24hUsd: number; change24hPct: number | null }` — fórmula de variação da spec §7; `rows` por `value` desc, nulos no fim.
  - `type Period = "7D" | "30D" | "1A"`; `PERIODS: Record<Period, { days: number; stepMs: number; sourceDays: 30 | 365 }>` = 7D `{7, 1h, 30}`, 30D `{30, 4h, 30}`, 1A `{365, 24h, 365}`; `parsePeriod(raw: unknown): Period` (inválido → `"30D"`).
  - `type PricePoint = [timestampMs: number, price: number]`
  - `buildCurve(holdings, history: Record<string, PricePoint[]>, current: Record<string, CurrentPrice>, period, now?): { points: { t: number; value: number }[]; missingHistory: string[] }`

  Algoritmo de `buildCurve` (só moedas com preço atual; `missingHistory` = símbolos dessas moedas sem histórico):
  ```
  step = PERIODS[p].stepMs
  start = ceil((now - days*24h) / step) * step
  for t = start; t < now; t += step:
     value(t) = Σ_i qty_i × (último preço da moeda i com ts ≤ t, ou 0 se não houver)
  ponto final: (now, Σ_i qty_i × current[i].usd)   // = total do card
  ```

- [ ] **Step 1: Testes que falham:** formatação com os exemplos acima. `computePortfolio`: BTC 0.5 @ 60000 (change 10) e ETH 2 @ 3000 (change null) → total 36000; shares 0.8333…/0.1666…; ordem BTC, ETH; `change24hUsd ≈ 30000 − 30000/1.1 ≈ 2727,27`; `change24hPct ≈ 2727,27 / 33272,73`; change −100 → ignorado; moeda sem preço → `value null`, fora do total; vazio → total 0. `buildCurve`: último ponto `t === now` e `value === total`; moeda cujo histórico começa no meio vale 0 antes; passo do `30D` = 4 h; moeda com preço mas sem histórico → em `missingHistory`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: formatação pt-BR e cálculos do portfólio`

---

### Task 7: Preços (CoinGecko + cache)

**Files:**
- Create: `src/lib/prices/cache.ts`, `src/lib/prices/coingecko.ts`, `src/lib/prices/index.ts`
- Test: `tests/prices/cache.test.ts`, `tests/prices/prices.test.ts`

**Interfaces:**
- Consumes: `Db`, `priceCache`, `CurrentPrice`, `PricePoint`, `Period`, `PERIODS`.
- Produces:
  - `cached<T>(db, key, ttlMs, loader: () => Promise<T>, now?): Promise<{ data: T; fetchedAt: Date; stale: boolean } | null>` — válido → cache; expirado/ausente → loader e grava; loader lança + cache → `stale: true`; sem cache → `null`.
  - `pruneExpired(db, prefix: string, now?): void`
  - `coingecko.ts` — todas passam por uma fila com no máx. 2 em andamento; header da chave quando há `COINGECKO_API_KEY`; 429 → espera 2 s e tenta 1 vez; outro status ≠ 200 lança:
    - `fetchSimplePrices(ids): Promise<Record<string, CurrentPrice>>` → `/simple/price?ids=a,b&vs_currencies=usd&include_24hr_change=true`
    - `fetchMarketChart(id, days: 30 | 365): Promise<PricePoint[]>` → `/coins/{id}/market_chart?vs_currency=usd&days={days}` (campo `prices`)
    - `fetchSearch(query): Promise<{ id; symbol; name; thumb }[]>` → `/search?query=` (campo `coins`, máx. 10)
  - `index.ts`:
    - `getCurrentPrices(db, ids, now?)` → `{ prices; fetchedAt: Date | null; stale: boolean }` (chave `price:${[...ids].sort().join(",")}`, 60 s; ids vazio → sem chamada)
    - `getHistory(db, ids, period, now?)` → `{ history: Record<string, PricePoint[]>; oldestFetchedAt: Date | null; stale: boolean }` (chave `chart:${id}:${sourceDays}`, 1 h)
    - `searchCoins(db, query, now?)` → resultados (chave `search:${q}`, 24 h; `normalizeSearch` null → `[]`; após gravar, `pruneExpired(db, "search:")`)

- [ ] **Step 1: Testes que falham** (`vi.stubGlobal("fetch", ...)`): cache hit não chama loader; expirado chama; loader lança com cache → `stale: true`; sem cache → `null`. `getCurrentPrices` com 429 constante e sem cache → `{ prices: {}, fetchedAt: null, stale: false }` sem lançar, e `fetch` chamado 2x (retry). Com `COINGECKO_API_KEY=k` → header `x-cg-demo-api-key: k`. 5 `fetchMarketChart` simultâneos → nunca mais de 2 em andamento. `getHistory("7D")` e `("30D")` usam a mesma chave `chart:bitcoin:30` (1 chamada só). Busca expirada é apagada ao gravar outra.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (nos testes, usar fake timers para os 2 s). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: cliente CoinGecko com fila, chave Demo, cache e fallback`

---

### Task 8: Login, layout autenticado e troca de senha

**Files:**
- Create: `src/lib/auth/current.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/actions.ts`, `src/components/app-header.tsx`, `src/app/(app)/conta/senha/page.tsx`, `src/app/(app)/conta/senha/actions.ts`, `src/app/(app)/page.tsx` (placeholder `Dashboard`)
- Delete: `src/app/page.tsx` do scaffold

**Interfaces:**
- Consumes: `attemptLogin`, `clientIp`, `ipLimited`, `recordIpFailure`, `validateSession`, `deleteSession`, `changeOwnPassword`, `sessionCookieName`, `sessionCookieOptions`, `getDb`.
- Produces:
  - `getCurrentUser(): Promise<{ id; username; isAdmin; sessionHash } | null>`
  - `requireUser()` → usuário ou `redirect("/login")`; `requireAdmin()` → admin ou `redirect("/")`.
  - `loginAction(prev, formData)`: `ip = clientIp(headers().get("x-forwarded-for"))`; `ipLimited(ip)` → erro de muitas tentativas; `attemptLogin` falhou → `recordIpFailure(ip)` + `Usuário ou senha inválidos`; sucesso → cookie + `redirect("/")`.
  - `logoutAction()` → apaga sessão e cookie, `redirect("/login")`.

- [ ] **Step 1:** Implementar. Login: card centralizado, `Usuário`/`Senha`, botão `Entrar`, erro via `useActionState`; `/login` logado → `/`. Header: logo, Dashboard / Ativos / Admin (só admin), menu (Trocar senha, Sair). Toda page e action chamam `requireUser`/`requireAdmin` por conta própria.
- [ ] **Step 2: Verificação manual** (`npm run dev`, admin da Task 4): `/` sem login → `/login`; senha errada → `Usuário ou senha inválidos`; 5 erros e depois senha certa → **mesma** mensagem; desbloquear via `unlockUser` em script/REPL ou esperar → entra; Sair → `/login`; trocar senha com atual errada → `Senha atual incorreta`.
- [ ] **Step 3:** `npm run build` e `npm test` → sucesso.
- [ ] **Step 4: Commit** `feat: telas de login, layout autenticado e troca de senha`

---

### Task 9: Página de administração

**Files:**
- Create: `src/app/(app)/admin/page.tsx`, `src/app/(app)/admin/actions.ts`, `src/app/(app)/admin/user-dialogs.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `listUsers`, `createUser`, `resetPassword`, `unlockUser`, `deleteUser`.

- [ ] **Step 1:** Implementar: tabela (Usuário, Admin, Criado em, Status — `Ativo` ou `Bloqueado até HH:MM`, ações). Diálogos "Novo usuário" e "Redefinir senha"; botões "Desbloquear" (só quando bloqueado) e "Remover" com confirmação. Toda action chama `requireAdmin()` e `revalidatePath("/admin")`; erros em toast.
- [ ] **Step 2: Verificação manual:** criar usuário comum → logar em janela anônima → sem link Admin e `/admin` → `/`; bloquear com 5 erros → status `Bloqueado até …` → Desbloquear → entra; remover a si mesmo → erro.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: página de administração de usuários`

---

### Task 10: Página de ativos

**Files:**
- Create: `src/app/(app)/ativos/page.tsx`, `src/app/(app)/ativos/actions.ts`, `src/app/(app)/ativos/add-asset-dialog.tsx`, `src/app/api/coins/search/route.ts`

**Interfaces:**
- Consumes: `requireUser`/`getCurrentUser`, `listHoldings`, `upsertHolding`, `updateQuantity`, `deleteHolding`, `parseQuantity`, `searchCoins`, `createWindowLimiter`, `formatQty`.
- Produces: `GET /api/coins/search?q=` → JSON `{ id, symbol, name, thumb }[]`; sem sessão → 401; acima de 30/min por usuário → 429 `{ error: "Muitas buscas, aguarde um minuto" }`.

- [ ] **Step 1:** Implementar: lista (ícone/nome/símbolo, quantidade, editar inline, remover com confirmação). Diálogo "Adicionar ativo" com busca (debounce 300 ms), resultados, quantidade; moeda já existente mostra a quantidade atual e salvar atualiza. Erros de `parseQuantity`/`upsertHolding` no campo. Actions usam `user.id` da sessão.
- [ ] **Step 2: Verificação manual:** `bit` → Bitcoin; adicionar `0,5` → `0,5`; Bitcoin de novo com `1` → 1 linha com `1`; `abc` → erro.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: página de ativos com busca CoinGecko`

---

### Task 11: Dashboard

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Create: `src/components/dashboard/balance-card.tsx`, `capital-chart.tsx` (client), `allocation-donut.tsx` (client), `holdings-table.tsx` (client), `stale-banner.tsx`

**Interfaces:**
- Consumes: `requireUser`, `listHoldings`, `getCurrentPrices`, `getHistory`, `computePortfolio`, `buildCurve`, `parsePeriod`, `formatUsd`, `formatPct`, `formatQty`.

- [ ] **Step 1:** Implementar. `periodo = parsePeriod(searchParams.periodo)`; seletor 7D / 30D / 1A como links `?periodo=`.
  - BalanceCard: `formatUsd(total)`, variação 24h verde/vermelha com `▲`/`▼` (`—` se `change24hPct` null).
  - CapitalChart: `AreaChart` com gradiente, tooltip com data e `formatUsd`; sem pontos → `Preços indisponíveis`; `missingHistory` não vazio → `Sem histórico: BTC, …`.
  - AllocationDonut: `PieChart` com `innerRadius`, legenda com símbolo e `formatPct`; só linhas com `value`.
  - HoldingsTable: Ativo | Quantidade | Preço | Valor US$ | % | 24h; ordenável; `—` para nulos; badge `sem preço`.
  - StaleBanner: se algum `stale`, `Preços de X min atrás` com X do mais antigo entre `fetchedAt` e `oldestFetchedAt`.
  - Vazio: `Adicione seu primeiro ativo` + botão para `/ativos`.
- [ ] **Step 2: Verificação manual:** 3 ativos → total = soma da tabela e = último ponto da curva; % somam 100%; trocar período muda a curva; `COINGECKO_BASE_URL=http://localhost:1` com banco novo → `—` e `Preços indisponíveis`, sem erro 500.
- [ ] **Step 3:** `npm run build` → sucesso.
- [ ] **Step 4: Commit** `feat: dashboard com saldo, curva, donut e tabela`

---

### Task 12: Docker, backup e guia do Easypanel

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `scripts/backup.mjs`, `scripts/prepare-standalone.mjs`, `README.md`
- Modify: `package.json` (script `start:standalone`)

**Interfaces:**
- Consumes: `createDb`, `ensureBootstrapAdmin` (via `instrumentation.ts`).

- [ ] **Step 1:** `package.json`: `"start:standalone": "node scripts/prepare-standalone.mjs && node .next/standalone/server.js"`, com `scripts/prepare-standalone.mjs` copiando `.next/static` → `.next/standalone/.next/static`, `public` → `.next/standalone/public` e `drizzle` → `.next/standalone/drizzle`.
- [ ] **Step 2:** `Dockerfile` multi-stage `node:22-bookworm-slim`:
  - `deps`: `npm ci`; se `node -e "require('@node-rs/argon2')"` falhar, `npm i --no-save @node-rs/argon2-linux-x64-gnu`.
  - `build`: `npm run build`.
  - `runner`: `WORKDIR /app`; copiar `.next/standalone` → `/app`, `.next/static` → `/app/.next/static`, `public`, `drizzle`, `scripts/backup.mjs`, `docker/entrypoint.sh`; `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/app/data/app.db`; `RUN node -e "require('better-sqlite3');require('@node-rs/argon2')"` (teste de fumaça — se falhar, copiar esses pacotes de `deps/node_modules` explicitamente); `ENTRYPOINT ["/app/docker/entrypoint.sh"]`; `CMD ["node","server.js"]`.
  - `.dockerignore`: `node_modules`, `.next`, `data`, `.git`, `e2e`, `tests`, `docs`.
- [ ] **Step 3:** `docker/entrypoint.sh` (LF, executável):
```sh
#!/bin/sh
set -e
mkdir -p /app/data
chown -R node:node /app/data
exec setpriv --reuid=node --regid=node --init-groups "$@"
```
- [ ] **Step 4:** `scripts/backup.mjs`: abre `DATABASE_PATH` com better-sqlite3 e chama `db.backup("/app/data/backups/app-AAAA-MM-DD.db")` (cria a pasta; ajusta dono para `node`), imprime o caminho.
- [ ] **Step 5: Verificação** (se houver Docker local; senão, no primeiro deploy do Easypanel):
  `docker build -t cripto-dash .` → sucesso;
  `mkdir -p /tmp/cd && docker run -d --name cd -p 3000:3000 -v /tmp/cd:/app/data -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=senha-forte-123 -e COOKIE_SECURE=false cripto-dash` (bind mount de pasta root);
  `docker logs cd` contém `Administrador inicial criado: admin`; login em `http://localhost:3000` funciona; `docker restart cd` → login continua; `docker exec cd node scripts/backup.mjs` → arquivo criado.
- [ ] **Step 6:** `README.md`: desenvolvimento (spec §10) e passo a passo do Easypanel: criar App a partir do Git, build por Dockerfile, 1 réplica, volume em `/app/data`, variáveis (`COINGECKO_API_KEY`, `ADMIN_USERNAME`/`ADMIN_PASSWORD` só no 1º deploy e depois remover, `APP_DOMAIN`, `TRUSTED_PROXY_HOPS` — 2 se usar Cloudflare), domínio/HTTPS, como criar a chave Demo na CoinGecko, backup (`node scripts/backup.mjs` pelo console, baixar o arquivo, ou backup de volume do Easypanel).
- [ ] **Step 7: Commit** `feat: Dockerfile, entrypoint, backup e guia do Easypanel`

---

### Task 13: Teste ponta a ponta

**Files:**
- Create: `playwright.config.ts`, `e2e/mock-coingecko.ts`, `e2e/flow.spec.ts`

**Interfaces:**
- Consumes: todas as telas; `ensureBootstrapAdmin` (admin criado por env); `start:standalone`.

- [ ] **Step 1:** `e2e/mock-coingecko.ts`: `node:http` na porta 4010 com `/api/v3/simple/price` (bitcoin 60000, change 1.5), `/api/v3/coins/bitcoin/market_chart` (pontos horários crescentes dos últimos 30 dias, ou diários para `days=365`) e `/api/v3/search` (Bitcoin). `playwright.config.ts`: `DATABASE_PATH = data/e2e-${Date.now()}.db` (novo a cada execução, sem apagar arquivos); dois `webServer`: mock (`npx tsx e2e/mock-coingecko.ts`) e app (`npm run build && npm run start:standalone`, porta 3100, envs `DATABASE_PATH`, `COINGECKO_BASE_URL=http://localhost:4010/api/v3`, `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=senha-forte-123`, `COOKIE_SECURE=false`, `PORT=3100`).
- [ ] **Step 2:** `flow.spec.ts`: login errado → `Usuário ou senha inválidos`; login certo → `Adicione seu primeiro ativo`; `/ativos` → adicionar Bitcoin `0,5`; dashboard → `US$ 30.000,00`, tabela com `BTC` e `100,00%`; clicar `7D` → URL com `periodo=7D` e gráfico visível; Sair → `/login`.
- [ ] **Step 3:** `npx playwright install chromium` e `npm run test:e2e` → PASS.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `test: fluxo ponta a ponta com CoinGecko simulada`
