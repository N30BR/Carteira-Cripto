# Dashboard de Carteira Cripto com Login — Design

**Data:** 2026-11-05
**Status:** aprovado em conversa, aguardando revisão da spec escrita

## 1. Objetivo

Sistema web, rodando localmente (computador do dono ou rede local), em que poucas pessoas (família/amigos) fazem login com usuário e senha e acessam um dashboard da própria carteira de criptoativos, no estilo Ledger Live.

**Sucesso:** cada pessoa entra, cadastra suas moedas e vê na hora o saldo total, a distribuição por ativo e a curva de capital, com preços atualizados automaticamente.

### Decisões do usuário
- Login com usuário e senha; contas criadas pelo administrador (sem cadastro público).
- Cada usuário vê apenas a própria carteira.
- Apenas criptoativos; o usuário informa manualmente a quantidade de cada ativo.
- Preços via API pública da CoinGecko.
- Gráfico de capital estimado: quantidades atuais × preços históricos.
- Execução local / rede local.
- Stack: Next.js (escolhida por ser a mais moderna e adequada ao visual desejado).

### Premissas (confirmadas implicitamente)
- Valores apenas em dólar (US$), formatados em pt-BR (`US$ 48.230,12`).
- Períodos do gráfico: 7D, 30D, 1A, Tudo.
- Tema escuro inspirado no Ledger Live.
- Página de administração simples para gerenciar usuários.

### Fora do escopo (YAGNI)
- Outras moedas de exibição além do dólar.
- Registro de transações, preço médio, lucro/prejuízo realizado.
- Integração com corretoras ou endereços on-chain.
- Recuperação de senha por e-mail.
- Cadastro público ou convites.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, tema escuro |
| Gráficos | Recharts (área e donut) |
| Banco | SQLite em arquivo (`data/app.db`) via Drizzle ORM + better-sqlite3 |
| Senhas | argon2 (hash) |
| Sessão | Cookie `httpOnly`, `sameSite=lax`, `secure` quando em HTTPS; sessão armazenada no banco |
| Preços | CoinGecko API pública (plano gratuito) com cache no servidor |
| Testes | Vitest (unidade/integração), Playwright (ponta a ponta) |

## 3. Arquitetura — módulos

Cada módulo tem uma responsabilidade e uma interface clara.

- **`auth`** — login, logout, criação/validação/encerramento de sessões, bloqueio por tentativas, helper `requireUser()` / `requireAdmin()` usado por páginas e ações.
- **`admin`** — criar usuário, redefinir senha, remover usuário. Apenas administradores.
- **`holdings`** — CRUD da carteira do usuário logado (ativo + quantidade). Toda consulta filtra pelo `user_id` da sessão.
- **`prices`** — único ponto de contato com a CoinGecko: preço atual + variação 24h, histórico de preços, busca/lista de moedas. Usa `price_cache`.
- **`portfolio`** — funções puras: valor por ativo, total, percentuais, montagem da curva histórica. Sem I/O.
- **`dashboard`** — páginas e componentes visuais (gráficos, tabela, cards).

Fluxo de dados do dashboard:
`requireUser()` → `holdings.listByUser(userId)` → `prices.getCurrent(coinIds)` + `prices.getHistory(coinIds, período)` → `portfolio.*` → componentes.

## 4. Telas

### 4.1 Login (`/login`)
- Campos usuário e senha, botão **Entrar**, centralizado em fundo escuro.
- Erro genérico: "Usuário ou senha inválidos".
- Após 5 falhas consecutivas, bloqueio de 15 minutos para aquele usuário (mensagem informa que está bloqueado temporariamente).
- Usuário já logado é redirecionado para `/`.

### 4.2 Dashboard (`/`)
- Cabeçalho: logo, navegação (Dashboard, Ativos, Admin — este só para admin), menu do usuário (trocar senha, sair).
- Card de saldo total em US$ com variação 24h (valor e %).
- Gráfico de área do capital com seletor 7D / 30D / 1A / Tudo.
- Gráfico donut com % por ativo e legenda.
- Tabela: Ativo | Quantidade | Preço | Valor US$ | % da carteira | 24h. Ordenada por valor (desc), ordenável clicando no cabeçalho.
- Estado vazio: "Adicione seu primeiro ativo" + botão para `/ativos`.

### 4.3 Ativos (`/ativos`)
- Lista dos ativos do usuário com ações editar quantidade e remover.
- **Adicionar ativo**: busca por nome ou símbolo (lista de moedas da CoinGecko) + campo quantidade.
- Um registro por moeda por usuário; adicionar uma moeda já existente leva à edição dela.

### 4.4 Admin (`/admin`)
- Tabela de usuários: usuário, admin (sim/não), criado em.
- Ações: criar usuário (usuário, senha, admin sim/não), redefinir senha, remover.
- Regras: não é possível remover a si mesmo nem o último administrador.

### 4.5 Trocar senha
- Exige senha atual + nova senha (mín. 8 caracteres) + confirmação.
- Ao trocar, encerra todas as outras sessões do usuário.

## 5. Dados

### Tabelas
- **`users`**: `id`, `username` (único), `password_hash`, `is_admin`, `created_at`, `failed_attempts`, `locked_until`.
- **`sessions`**: `id` (aleatório, 32+ bytes), `user_id`, `expires_at` (7 dias). Removidas no logout, na troca/redefinição de senha e na remoção do usuário.
- **`holdings`**: `id`, `user_id`, `coin_id` (id CoinGecko, ex. `bitcoin`), `symbol`, `name`, `quantity` (texto decimal para evitar perda de precisão), `updated_at`. Único por (`user_id`, `coin_id`).
- **`price_cache`**: `key`, `payload` (JSON), `expires_at`.

### Primeiro administrador
- Script `npm run create-admin` pede usuário e senha no terminal e cria o admin.

## 6. Preços e cálculos

### Cache
- Preço atual + variação 24h: validade ~60 s.
- Histórico de preços: validade ~1 h.
- Lista de moedas para busca: validade ~24 h.
- Requisições ao histórico agrupadas por moeda e período; vários usuários compartilham o mesmo cache.

### Cálculos (`portfolio`, funções puras)
- `valor_ativo = quantidade × preço_atual`
- `total = Σ valor_ativo` (apenas ativos com preço disponível)
- `percentual = valor_ativo ÷ total`
- `curva(t) = Σ quantidade_atual × preço(t)`
- Resolução: 7D por hora, 30D a cada 4 h, 1A e Tudo por dia.
- **Tudo**: começa na data mais antiga em que todas as moedas da carteira têm preço, limitado a 365 dias (limite do plano gratuito).
- Variação 24h do total: calculada a partir de preço atual e variação 24h de cada ativo.

### Formatação
- pt-BR: `US$ 48.230,12`, percentuais com 2 casas.
- Quantidades: até 8 casas decimais, sem zeros à direita.

## 7. Tratamento de erros

- **CoinGecko indisponível ou com limite atingido:** usa o último valor em cache (mesmo expirado) e mostra aviso "Preços de X min atrás". Sem cache: tabela mostra quantidades e "—" nos valores; gráficos mostram estado "Preços indisponíveis".
- **Moeda sem preço:** fica fora do total e do donut, marcada na tabela.
- **Validação de entrada:** quantidade deve ser número > 0; usuário único; senha mínima de 8 caracteres. Mensagens claras no formulário.
- **Sessão expirada ou inválida:** redireciona para `/login`.
- **Autorização:** toda leitura/escrita de `holdings` filtra pelo usuário da sessão no servidor; rotas e ações de admin verificam `is_admin`.
- **CSRF:** mutações via Server Actions do Next.js (proteção de origem embutida).

## 8. Testes

- **Vitest — unidade:** `portfolio` (totais, percentuais, curva, moeda sem preço, carteira vazia), formatação, cache de preços (acerto, expiração, fallback para valor expirado).
- **Vitest — integração** com SQLite temporário: login (senha certa/errada, bloqueio após 5 falhas, desbloqueio após 15 min), expiração de sessão, isolamento entre usuários em `holdings`, regras do admin (não remover a si mesmo / último admin).
- **Playwright — ponta a ponta** com CoinGecko simulada: login → adicionar ativo → ver dashboard com total, donut e tabela → trocar período do gráfico → sair.

## 9. Execução

1. `npm install`
2. `npm run create-admin`
3. `npm run build && npm start` — acessível em `http://localhost:3000` ou pelo IP da máquina na rede local.
