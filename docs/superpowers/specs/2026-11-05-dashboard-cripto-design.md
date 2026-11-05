# Dashboard de Carteira Cripto com Login — Design

**Data:** 2026-11-05
**Status:** aprovado em conversa; revisado (revisão técnica de 2026-11-05 aplicada); deploy alterado de local para Easypanel com aprovação do usuário.

## 1. Objetivo

Sistema web, hospedado na VPS do dono via Easypanel (Docker, HTTPS com domínio próprio), em que poucas pessoas (família/amigos) fazem login com usuário e senha e acessam um dashboard da própria carteira de criptoativos, no estilo Ledger Live.

**Sucesso:** cada pessoa entra, cadastra suas moedas e vê na hora o saldo total, a distribuição por ativo e a curva de capital, com preços atualizados automaticamente.

### Decisões do usuário
- Login com usuário e senha; contas criadas pelo administrador (sem cadastro público).
- Cada usuário vê apenas a própria carteira.
- Apenas criptoativos negociados na Binance contra USDT (via busca); o usuário informa manualmente a quantidade de cada ativo.
- Preços via API pública da Binance, sem chave. Decidido em 2026-11-05, substituindo a CoinGecko, cujo acesso sem chave dava erro 429 com frequência.
- Gráfico de capital estimado: quantidades atuais × preços históricos.
- Períodos do gráfico: **7D, 30D, 1A** (sem "Tudo": a API gratuita só tem 365 dias de histórico).
- Hospedagem na VPS via Easypanel.
- Stack: Next.js.

### Premissas
- Valores apenas em dólar (US$), formatados em pt-BR (`US$ 48.230,12`).
- Período padrão do gráfico: 30D.
- Tema escuro inspirado no Ledger Live.
- Página de administração simples para gerenciar usuários.

### Fora do escopo (YAGNI)
- Outras moedas de exibição além do dólar.
- Registro de transações, preço médio, lucro/prejuízo realizado.
- Histórico além de 365 dias (exigiria gravar snapshots próprios).
- Integração com corretoras ou endereços on-chain.
- Recuperação de senha por e-mail.
- Cadastro público ou convites.
- Mais de uma réplica do serviço.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, tema escuro |
| Gráficos | Recharts (área e donut) |
| Banco | SQLite via Drizzle ORM + better-sqlite3. Caminho em `DATABASE_PATH` (padrão `data/app.db`, relativo ao diretório de execução; em produção `/app/data/app.db`). `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`. |
| Senhas | argon2 (`@node-rs/argon2`) |
| Sessão | Cookie `httpOnly`, `sameSite=lax`; `secure` por padrão em produção; no banco fica só o SHA-256 do id da sessão |
| Preços | Binance, dados de mercado públicos (`data-api.binance.vision`), pares `<MOEDA>USDT`, com cache no servidor |
| Deploy | Docker (Next.js `output: "standalone"`) no Easypanel, volume persistente em `/app/data`, 1 réplica |
| Testes | Vitest (unidade/integração), Playwright (ponta a ponta) |

## 3. Arquitetura — módulos

- **`auth`** — login, logout, sessões, bloqueio por usuário, limite por IP, `requireUser()` / `requireAdmin()`.
- **`admin`** — criar usuário, redefinir senha, desbloquear, remover. Apenas administradores.
- **`holdings`** — CRUD da carteira do usuário logado. Toda consulta filtra pelo `user_id` da sessão.
- **`prices`** — único ponto de contato com a Binance: lista de moedas, preço atual + variação 24h, histórico. Usa `price_cache`.
- **`portfolio`** — funções puras: valores, total, percentuais, variação 24h, curva. Sem I/O.
- **`dashboard`** — páginas e componentes visuais.

**Autorização:** toda page e toda Server Action chama `requireUser()` ou `requireAdmin()` por conta própria. O layout autenticado é só visual, não barreira de segurança.

Fluxo do dashboard: `requireUser()` → `listHoldings(userId)` → `getCurrentPrices` + `getHistory(período)` → `portfolio.*` → componentes.

## 4. Telas

### 4.1 Login (`/login`)
- Campos usuário e senha, botão **Entrar**, centralizado em fundo escuro.
- Qualquer falha de credencial — senha errada, usuário inexistente **ou conta bloqueada** — mostra a mesma mensagem: **"Usuário ou senha inválidos"**. Assim não se descobre quais usuários existem.
- Limite por IP excedido mostra: **"Muitas tentativas. Tente novamente em 15 minutos."**
- Usuário já logado é redirecionado para `/`.

### 4.2 Dashboard (`/`)
- Cabeçalho: logo, navegação (Dashboard, Ativos, Admin — este só para admin), menu do usuário (Trocar senha, Sair).
- Card de saldo total em US$ com variação 24h (valor e %).
- Gráfico de área do capital com seletor 7D / 30D / 1A (padrão 30D).
- Donut com % por ativo e legenda.
- Tabela: Ativo | Quantidade | Preço | Valor US$ | % da carteira | 24h. Ordenada por valor (desc), ordenável clicando no cabeçalho.
- Estado vazio: "Adicione seu primeiro ativo" + botão para `/ativos`.

### 4.3 Ativos (`/ativos`)
- Lista dos ativos do usuário com ações editar quantidade e remover.
- **Adicionar ativo**: busca por símbolo ou nome na lista de moedas com par USDT ativo na Binance (símbolo exato primeiro, depois prefixo do símbolo, depois nome) + campo quantidade. A Binance não fornece nomes: uma lista fixa cobre as moedas mais comuns; as outras aparecem pelo símbolo. Moedas fora da lista não podem ser adicionadas (validado no servidor).
- Um registro por moeda por usuário; adicionar uma moeda já existente atualiza a quantidade.
- Máximo de 100 ativos por usuário.

### 4.4 Admin (`/admin`)
- Tabela de usuários: usuário, admin (sim/não), criado em, status (ativo / bloqueado até HH:MM).
- Ações: criar usuário, redefinir senha, **desbloquear**, remover.
- Regras: não é possível remover a si mesmo nem o último administrador. Redefinir senha também desbloqueia a conta e encerra as sessões do usuário.

### 4.5 Trocar senha
- Exige senha atual + nova senha + confirmação.
- Senha atual errada conta como falha de login do usuário (mesmo contador e bloqueio).
- Ao trocar, encerra todas as outras sessões do usuário.

## 5. Dados

### Tabelas
- **`users`**: `id`, `username` (único, minúsculo), `password_hash`, `is_admin`, `created_at`, `failed_attempts`, `locked_until`.
- **`sessions`**: `id_hash` (SHA-256 hex do id aleatório de 32 bytes que vai no cookie), `user_id`, `expires_at` (7 dias). Removidas no logout, na troca/redefinição de senha e na remoção do usuário.
- **`holdings`**: `id`, `user_id`, `coin_id` (símbolo na Binance, ex. `BTC`), `symbol`, `name`, `quantity` (texto decimal), `updated_at`. Único por (`user_id`, `coin_id`).
- **`price_cache`**: `key`, `payload` (JSON), `fetched_at`, `expires_at`.

### Regras de entrada
- Username: 3–32 caracteres, `a-z 0-9 . _ -`, salvo com `trim()` e em minúsculas.
- Senha: 8–256 caracteres.
- Quantidade: número > 0, aceita vírgula ou ponto como separador decimal, sem separador de milhar, até 18 casas.
- Termo de busca: `trim()`, minúsculo, 2–50 caracteres.

### Primeiro administrador
- **Produção:** ao iniciar, se não existir nenhum usuário e as variáveis `ADMIN_USERNAME` e `ADMIN_PASSWORD` estiverem definidas, o app cria esse admin. Depois do primeiro login, remover as duas variáveis no Easypanel.
- **Desenvolvimento:** `npm run create-admin` (pergunta usuário e senha no terminal).

## 6. Segurança

- **Bloqueio por usuário:** 5 falhas consecutivas → bloqueado por 15 minutos. Tentativas durante o bloqueio não são verificadas nem contam. O admin pode desbloquear.
- **Tempo constante:** para usuário inexistente, o login roda a verificação argon2 contra um hash fixo, para responder no mesmo tempo.
- **Limite por IP:** máximo de 20 **falhas** de login por IP em 15 minutos (contador em memória). O IP do cliente é o valor que o proxy do Easypanel (Traefik) acrescenta: o **N-ésimo valor a partir da direita** do `x-forwarded-for`, com N = `TRUSTED_PROXY_HOPS` (padrão 1). Valores mais à esquerda são controlados pelo cliente e ignorados. Se houver Cloudflare na frente, usar `TRUSTED_PROXY_HOPS=2`. Sem cabeçalho (desenvolvimento), o limite por IP não se aplica.
- **Cookie de sessão:** `secure = NODE_ENV === "production" && COOKIE_SECURE !== "false"`. Com `secure`, o nome é `__Host-session`; sem, `session`.
- **CSRF:** Server Actions do Next.js (comparação de `Origin` com o host). Se `APP_DOMAIN` estiver definido, ele é adicionado a `serverActions.allowedOrigins`.
- **Busca:** máximo de 30 buscas por usuário por minuto (em memória).

## 7. Preços e cálculos

### Binance
- Base `BINANCE_BASE_URL` (padrão `https://data-api.binance.vision`), sem chave. Preço em USDT tratado como US$; o próprio USDT vale 1, com variação 0 e histórico fixo em 1.
- Lista de moedas: `/api/v3/exchangeInfo` (pares `*USDT` com status TRADING), cache de 24 h. Preço e histórico só são pedidos para moedas dessa lista, porque um símbolo inválido faz a Binance recusar o pedido inteiro.
- Preço atual: `/api/v3/ticker/24hr?symbols=[...]` (`lastPrice`, `priceChangePercent`).
- Histórico: `/api/v3/klines` com velas de 1 h (`limit=720`; serve 7D e 30D) e diárias (`limit=365`; serve 1A). Cada ponto usa o horário e o preço de fechamento da vela.
- No máximo 2 requisições simultâneas; timeout de 8 s (20 s para a lista); em 429, uma nova tentativa após 2 s; depois de qualquer falha, a API não é chamada por 60 s.
- A Binance bloqueia alguns países (ex.: EUA): a VPS precisa estar numa região atendida.

### Cache
- Preço atual + variação 24h: 60 s, por moeda (adicionar uma moeda não descarta o preço das outras). Histórico: 1 h. Lista de moedas: 24 h.
- Falha da API → usa o último valor em cache, mesmo expirado, e marca como antigo.

### Cálculos (`portfolio`, funções puras)
- `valor_ativo = quantidade × preço_atual`; `total = Σ valor_ativo` (só ativos com preço).
- `percentual = valor_ativo ÷ total`.
- **Variação 24h do total:** para cada ativo com preço e `change24h` conhecido e > −100: `Δ_i = valor_i − valor_i / (1 + change24h_i/100)`. `Δ = Σ Δ_i`; `% = Δ / (total − Δ)` (se `total − Δ ≤ 0`, % fica indisponível). Ativos sem `change24h` contam como Δ 0.
- **Curva:** `curva(t) = Σ quantidade_i × preço_i(t)`, onde `preço_i(t)` é o último preço da moeda com timestamp ≤ t; antes do primeiro preço da moeda, ela vale 0.
  - Resolução e janela: 7D = pontos de 1 h nos últimos 7 dias; 30D = pontos de 4 h nos últimos 30 dias; 1A = pontos diários nos últimos 365 dias. O início é alinhado ao passo.
  - O último ponto é sempre `now`, calculado com os preços atuais — o fim da curva bate com o saldo do card.
  - A curva usa as mesmas moedas do total (as que têm preço atual). Moedas sem histórico são listadas e o gráfico mostra o aviso "Sem histórico: BTC, ...".

### Formatação
- pt-BR: `US$ 48.230,12`, percentuais com 2 casas.
- Quantidades: até 8 casas decimais, sem zeros à direita, sem notação científica.

## 8. Tratamento de erros

- **Binance indisponível:** usa cache (mesmo expirado) e mostra "Preços de X min atrás", com X a partir do dado mais antigo usado (preço atual ou histórico). Sem cache: tabela mostra quantidades e "—"; gráficos mostram "Preços indisponíveis". Nunca erro 500.
- **Moeda sem preço:** fica fora do total, do donut e da curva, marcada na tabela como "sem preço".
- **Validação de entrada:** mensagens claras no formulário (regras em §5).
- **Sessão expirada ou inválida:** redireciona para `/login`.

## 9. Testes

- **Vitest — unidade:** `portfolio` (totais, percentuais, variação 24h, curva, moeda sem preço/sem histórico, carteira vazia), formatação, validação, cache de preços (acerto, expiração, fallback), extração de IP.
- **Vitest — integração** com SQLite temporário: login (certo/errado, bloqueio, mesma mensagem para bloqueado, desbloqueio), sessões (expiração, hash no banco), isolamento entre usuários em `holdings`, regras do admin, criação do admin por variáveis de ambiente.
- **Playwright — ponta a ponta** com Binance simulada, rodando o build `standalone`: login → adicionar ativo → dashboard com total, donut e tabela → trocar período → sair.

## 10. Execução e deploy

### Desenvolvimento
1. `npm install`
2. `npm run create-admin`
3. `npm run dev` → `http://localhost:3000`

### Produção (Easypanel)
- Serviço **App** apontando para o repositório Git, build pelo `Dockerfile` (Next.js `standalone`, Node 22, porta 3000), **1 réplica**.
- **Volume** montado em `/app/data`. Na inicialização o container ajusta o dono da pasta e roda o app como usuário não-root `node`.
- Variáveis: `ADMIN_USERNAME` e `ADMIN_PASSWORD` (só no primeiro deploy), opcionais `APP_DOMAIN`, `TRUSTED_PROXY_HOPS`, `APP_TIMEZONE`, `BINANCE_BASE_URL`.
- Domínio com HTTPS configurado no Easypanel.
- Migrações aplicadas automaticamente ao iniciar.
- **Backup:** `node scripts/backup.mjs` (pelo console do serviço) grava uma cópia consistente em `/app/data/backups/app-AAAA-MM-DD.db`; o README explica como agendar e baixar. Também é possível usar o backup de volumes do Easypanel.
