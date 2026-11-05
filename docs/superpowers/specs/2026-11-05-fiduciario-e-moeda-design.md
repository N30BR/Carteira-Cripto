# Dashboard fiduciário ($) e moeda de referência — Design

**Data:** 2026-11-05
**Status:** design aprovado em conversa (partes 1 e 2). Complementa `2026-11-05-dashboard-cripto-design.md`, cujas regras de login, segurança, deploy e Binance continuam valendo.

## 1. Objetivo

Acrescentar ao app uma visão das contas em Real (conta PF, conta PJ, caixinhas…), separada da carteira cripto, e permitir ver os dois dashboards em **USDT, BTC ou BRL**.

### Decisões do usuário
- Saldos fiduciários **atualizados à mão**; cada atualização fica guardada com data.
- **Cada pessoa cria as próprias contas** (nome livre) e vê só as suas.
- Todas as contas fiduciárias são em **Real**.
- Dashboard "$" **igual ao Cripto**: saldo total, curva, pizza por conta, tabela.
- Navegação: **Cripto** (dashboard atual) · **$** (fiduciário) · **Ativos** · **Admin**.
- "Meus ativos" é uma página só: seção **Cripto** em cima, **Fiduciário** embaixo, cada uma com sua tabela e seu botão de inserção.
- Moeda de referência em cada dashboard, num menu igual ao de "Trocar senha / Sair": **USDT, BTC, BRL**. Padrão: Cripto em **USDT**, $ em **BRL**.
- USDT exibido como `US$ 1.234,56`; BRL como `R$ 1.234,56`; BTC como `₿ 0,12345678`.

### Fora do escopo
- Rendimento automático de caixinha (CDI) — o saldo é sempre o informado.
- Lançamentos de entradas/saídas, importação de extrato, Open Finance.
- Contas em outras moedas além do Real.

## 2. Dados

Tabelas novas (migração Drizzle aplicada automaticamente no start):

- **`fiat_accounts`**: `id`, `user_id` (FK `users`, cascade), `name` (1–40 caracteres, sem espaços nas pontas), `created_at`. Único por (`user_id`, `name`). Máximo de 50 contas por pessoa.
- **`fiat_balances`**: `id`, `account_id` (FK `fiat_accounts`, cascade), `date` (texto `AAAA-MM-DD`), `amount` (texto decimal em reais, 2 casas, pode ser negativo — ex.: cheque especial), `created_at`. Único por (`account_id`, `date`): registrar de novo no mesmo dia **substitui** o valor do dia.

### Regras de entrada
- **Valor em reais:** aceita `5230`, `5230,5`, `5.230,50`, `5230.50`, `R$ 5.230,50`, `-120,00`. Com vírgula, pontos são separadores de milhar; sem vírgula, `1.234.567` é milhar e `5230.50` é decimal. Até 13 dígitos inteiros e 2 casas.
- **Data:** padrão é hoje (fuso `APP_TIMEZONE`); não pode ser no futuro nem antes de 2000-01-01.
- Toda leitura/escrita confere no servidor que a conta pertence ao usuário da sessão.

## 3. Telas

### 3.1 Navegação
Menu: **Cripto** (`/`) · **$** (`/fiduciario`, rótulo acessível "Dashboard fiduciário") · **Ativos** · **Admin** (só admin).

### 3.2 Meus ativos (`/ativos`)
- **Seção Cripto:** como hoje.
- **Seção Fiduciário:** tabela **Conta | Saldo | Atualizado em | Ações**.
  - **Nova conta:** nome + saldo atual (+ data, padrão hoje).
  - **Atualizar saldo:** valor + data (padrão hoje).
  - **Renomear**, **Remover** (com confirmação; apaga o histórico da conta).

### 3.3 Dashboard $ (`/fiduciario`)
Mesmos blocos do Cripto:
- **Saldo total** (soma do último saldo de cada conta) e variação desde 30 dias atrás ("no mês").
- **Curva em degraus**: o saldo de cada conta vale o último registrado até aquele dia; antes do primeiro registro vale 0. Períodos **30D, 6M, 1A, Tudo** (padrão 30D), um ponto por dia; "Tudo" começa no primeiro registro; o último ponto é agora.
- **Pizza por conta** (contas com saldo > 0; maiores 7 + "Outros").
- **Tabela:** Conta | Saldo | % | Atualizado em | 1M | 1A (variação vs. saldo de 30/365 dias atrás; "—" sem registro anterior).
- Sem contas: "Cadastre sua primeira conta" + botão para Ativos.

## 4. Moeda de referência

- Botão **[USDT ▾]** no topo de cada dashboard (ao lado do período) abre menu com USDT, BTC, BRL.
- Escolha vai na URL (`?moeda=`) e fica lembrada por dashboard num cookie do navegador (`moeda-cripto`, `moeda-fiat`); links de período preservam a moeda e vice-versa.
- **Cotações (Binance, sem chave):** `USDTBRL` (R$ por 1 USDT) e `BTCUSDT`. Atual: cache 60 s. Histórico: velas 1 h (30 dias) e 1 d (1000 dias, ~2,7 anos), cache 1 h.
- **Fatores:** a partir de USDT → USDT ×1, BRL ×USDTBRL, BTC ÷BTCUSDT. A partir de BRL → divide pelo USDTBRL antes.
- **O que converte:**
  - Valores atuais (saldo, preços, valores, tabela): cotação atual.
  - **Curva:** cada ponto pela cotação daquele instante (última cotação com horário ≤ ponto; antes do histórico, a mais antiga disponível); o último ponto usa a cotação atual.
  - **Variações (24h, 7D, 1M, 1A e a do card):** na moeda escolhida: `(1 + var_base) × fator_agora / fator_antes − 1`.
  - Percentuais de distribuição não mudam.
- **Falha de cotação:** sem cotação atual (nem em cache), o dashboard usa a moeda padrão dele e mostra "Cotação de X indisponível no momento, mostrando em Y". Cotação vinda de cache antigo entra no aviso de "dados de X min atrás".
- Preço unitário em BTC: 8 casas; abaixo de ₿ 0,00000001 aparece `< ₿ 0,00000001`.

## 5. Testes
- Unidade: parse de reais, regras de data, conversão/formatação nas 3 moedas, curva convertida ponto a ponto, variação na moeda de referência, curva fiduciária em degraus, variações 1M/1A das contas.
- Integração (SQLite temporário): CRUD de contas e saldos, substituição no mesmo dia, limite de contas, isolamento entre usuários, actions recusando ids alheios/inválidos.
- Ponta a ponta: criar conta fiduciária, ver o $ em R$, trocar a moeda do Cripto para BRL.
