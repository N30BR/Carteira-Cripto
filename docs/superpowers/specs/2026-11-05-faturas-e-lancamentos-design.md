# Faturas e Lançamentos (cartões de crédito) + ajustes — Design

**Data:** 2026-11-05
**Status:** design aprovado em conversa (com ajustes do usuário). Complementa as specs anteriores; login, isolamento, segurança e deploy continuam valendo.
**Referências do usuário:** `prompt0.md`, `custos.png` (Lançamentos) e `dash.png` (Faturas), mais a descrição textual das duas imagens.

## 1. Decisões do usuário
- Menu: **Cripto · R$ · Faturas · Lançamentos · Ativos · Admin** (a aba "$" passa a se chamar "R$").
- Lançamentos **somente manuais** (sem leitura de prints, sem integração bancária).
- Cada pessoa tem os próprios cartões (Cartão PF e Cartão PJ), lançamentos e categorias.
- Tema escuro atual e características visuais atuais; as imagens orientam a organização (cards, gráficos, tabelas), não as cores de fundo.
- Tudo em **R$** nessas duas abas.
- Cores dos tokens (pizza e legendas do Cripto): BTC #F7931A, ETH #4B5563, USDT #26A17B, SOL #9945FF, LINK #2A5ADA, AAVE #7C6CFF, TAO #8B8F97, XLM #1F2937 (preto), NEAR #FFFFFF (branco). Demais moedas: paleta atual. Fatias com borda fina para cores escuras/claras não sumirem.

## 2. Ajustes nas abas existentes
- **Cripto:** períodos **1S · 1M · 1A** (antes 7D, 30D, 1A; `?periodo=7D/30D` antigos continuam aceitos). Tabela: **24h · 1S · 1M · 6M · 1A** (6M a partir do histórico diário de 1 ano já buscado).
- **R$ (contas):** tabela com **1M · 2M · 3M · 1A** (variação contra o saldo de 30/60/90/365 dias atrás).

## 3. Dados (tabelas novas; nenhuma tabela existente muda)
- **`card_categories`**: `id`, `user_id` (cascade), `name` (1–40, NFC, sem caracteres invisíveis), `created_at`. Único por (`user_id`, `name`). Na primeira visita de quem não tem categorias nem compras, cria as 13 padrão: Alimentação, Assinaturas, Serviços, Equipamentos, Manutenção, Gasolina, Saúde, Transporte, Educação e Cursos, Software e Tecnologia, Impostos e Taxas, Compras Diversas, Outros. Máx. 50 por pessoa.
- **`card_expenses`** (compra de origem): `id`, `user_id` (cascade), `description` (1–80), `total_cents` (inteiro > 0, até 10^11), `installments` (1–48), `first_invoice` (`AAAA-MM`), `purchase_date` (`AAAA-MM-DD`), `nature` (`PF`|`PJ`), `card` (`PF`|`PJ`), `category_id` (nullable, `ON DELETE SET NULL` → "Sem categoria"), `notes` (0–500), `created_at`.
- **`card_installments`**: `id`, `expense_id` (cascade), `number` (1..N), `invoice_month` (`AAAA-MM`), `amount_cents`, `paid` (boolean). Único por (`expense_id`, `number`).
- **Rateio:** `base = floor(total / N)`; parcelas 1..N−1 = base; última = total − base × (N−1).

## 4. Regras do formulário
- **Valor** com chave "valor da parcela / valor total" (padrão: parcela). Se for parcela: `total = parcela × N`.
- **Parcelas atual/total** (ex.: 6/12) + **mês de referência** (mês da fatura) → `first_invoice = mês − (atual − 1)`.
- **Status** escolhido vale para a parcela atual; anteriores ficam **pagas**; futuras **pendentes**. Depois, cada parcela alterna pago/pendente individualmente.
- **Editar** recalcula as parcelas preservando o `paid` de cada número que continua existindo. **Excluir** remove a compra e suas parcelas (com confirmação).
- Data da compra: padrão hoje (fuso `APP_TIMEZONE`), entre 2000-01-01 e hoje. Mês de fatura entre 2000-01 e 10 anos à frente.
- Limite: 60 alterações/min por pessoa (mesmo limitador do fiduciário); máx. 2.000 compras por pessoa.

## 5. Tela Lançamentos (`/lancamentos`)
- Cabeçalho "Lançamento de Custos" + subtítulo; seletor de **mês de referência** (`?mes=AAAA-MM`, padrão mês atual).
- Card **Novo Lançamento**: Descrição · Valor · Parcelas (atual/total) · PF/PJ · Cartão · Categoria · **Adicionar**; segunda linha: data da compra, chave parcela/total, status, observações; prévia "12× de R$ 350,00 · total R$ 4.200,00 · 1ª fatura Dez/2024".
- Filtros simultâneos: **Todos (n) · PF (n) · PJ (n)**, cartão, categoria, status, busca por descrição.
- Tabela das **parcelas do mês**: Descrição · Categoria (etiqueta colorida) · Tipo · Cartão · Valor · Parcelas (n/N) · Mês da fatura · Status (clique alterna) · Ações (editar, excluir).
- Barra de totais do mês (das linhas filtradas): Total PF · Total PJ · Cartão PF · Cartão PJ · **Total**.
- Botão **Categorias** abre janela para criar/renomear/excluir.

## 6. Tela Faturas (`/faturas`)
- Cabeçalho "Dashboard de controle financeiro" + seletor de mês.
- Indicadores: **Fatura consolidada · Cartão PF · Cartão PJ**; linha secundária: Despesas PF · Despesas PJ · Comprometido em parcelas futuras (parcelas pendentes com fatura posterior ao mês escolhido).
- **Barras** (6 meses até o escolhido): Cartão PF (verde-turquesa #28A38C) × Cartão PJ (roxo #9470E7); seletor Ambos/Cartão PF/Cartão PJ; tooltip com mês, cartão e valor.
- **Pizza por categoria** (mês escolhido; filtro Todos/PF/PJ; 7 maiores + Outros) e **pizza PF × PJ** (natureza).
- Seções **Cartão PF** e **Cartão PJ**: fatura do mês, despesas PF, despesas PJ, pago, pendente; tabela Mês · Total · Descrição dos custos (3 categorias principais) dos 6 meses, mês escolhido destacado.
- **Tabela consolidada** (12 meses até o escolhido): Mês · Cartão PF · Cartão PJ · Despesas PF · Despesas PJ · Total. Invariantes: Cartão PF + Cartão PJ = Total = Despesas PF + Despesas PJ.
- **Projeção**: próximos 6 meses após o escolhido, por cartão e total; total de parcelas futuras; quantidade de compras parceladas ativas (com parcela de fatura posterior ao mês).
- Sem lançamentos: "Nenhum lançamento ainda" + botão para Lançamentos.

## 7. Testes
- Unidade: rateio e arredondamento, mês da 1ª fatura a partir de "atual/total", status inicial, edição preservando pagos, agregações (invariantes), projeção, filtros, 6M/2M/3M, cores dos tokens.
- Integração: CRUD com isolamento entre usuários, categorias (seed, renomear, excluir → sem categoria), limites.
- Ponta a ponta: lançar compra parcelada, ver no mês, marcar paga, ver Faturas.
