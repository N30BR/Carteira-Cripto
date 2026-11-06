# Aba "Gráficos" — navegador de preços (estilo TradingView, estética do app)

Data: 2026-11-05. Decisões do usuário: dados de liquidação/delta pela Binance (grátis, heatmap
marcado como estimado); chave FRED gratuita já cadastrada no Easypanel (`FRED_API_KEY`); tudo
salvo **na conta do usuário**; entrega em **3 etapas**, cada uma testada e revisada.

Referências visuais: `tradingview/*.png` (barra superior com par, tempos, indicadores e layout;
barra lateral de ferramentas; painéis de indicadores empilhados; menu de ocultar; seletor de
layout; intervalos 1D/5D/1M… no rodapé).

## Etapa 1 — gráfico completo

**Motor:** KLineCharts 10.1 (Apache-2.0): velas, ferramentas de desenho, indicadores prontos e
personalizados, escala logarítmica, vários painéis. Tema escuro com as cores do app (verde
`#22c55e` alta, vermelho `#ef4444` baixa, roxo `#8b7cf6` destaque).

**Nova aba** "Gráficos" no menu, depois de "Resumo".

**Dados:** velas da Binance pública (`/api/v3/klines`), buscadas **pelo servidor** (rota
autenticada `/api/candles`), com validação de par/tempo/limite, cache curto e o mesmo disjuntor
da aba Cripto. Nada de chave. Pares: todos os da Binance cotados em **USDT, BTC e ETH**
(lista do exchangeInfo já usada no app). Tempos: 1m, 5m, 15m, 1h, 4h, 1D, 1S, 1M.
Atalhos de período no rodapé: 1D, 5D, 1M, 3M, 6M, YTD, 1A, 5A, Tudo.

**Janela:**
- Barra superior: busca de par (USDT/BTC/ETH), tempos, tipo de gráfico (velas, barras, linha,
  área), **Indicadores**, **Layout** (1, 2, 4 ou 8 divisões) e escala **log** / %.
- Até **10 abas** de trabalho no topo da área do gráfico (criar, renomear, fechar, alternar).
- Cada divisão tem o seu par, tempo, indicadores e desenhos.
- Barra lateral de ferramentas (linha de tendência, horizontal, raio, canal, Fibonacci,
  retângulo, texto, medida, ímã, ocultar desenhos/indicadores, apagar tudo) com
  **personalização**: adicionar, retirar e **favoritar** ferramentas (favoritas no topo).

**Indicadores (sem limite por gráfico; ≥ 15 disponíveis):** MA, EMA, MA ribbon, BOLL, VWAP,
SAR, Ichimoku, Volume, **Volume Profile (faixa visível)**, RSI (com divergências), MACD, KDJ,
Estocástico RSI, ATR, OBV, CCI, Williams %R, DMI/ADX, MFI. Cada um com parâmetros editáveis,
ocultar e remover.

**Salvar na conta:** tabela `chart_workspaces` (por usuário: até 10 abas; cada uma com layout e
estado de cada divisão — par, tempo, indicadores, desenhos — em JSON validado e com tamanho
máximo) e preferências de ferramentas (`chart_prefs`: ferramentas visíveis e favoritas). Salva
automaticamente (com atraso de ~1 s após a última mudança), por server actions com
`requireUser`, validação de formato e limite de tamanho, e limite de alterações por minuto.

**Modo discreto:** não se aplica (só preços de mercado).

## Etapa 2 — comparações
Sobrepor na mesma divisão, em escala % a partir do início da janela ou em eixo próprio: outros
pares cripto, **ouro** (PAXG/USDT e XAUT/USDT), **juros dos EUA** (FRED: Fed Funds, Treasury 10a),
**liquidez** (FRED: M2 EUA; "liquidez global" = soma aproximada de M2 de EUA, zona do euro,
China e Japão convertida em US$). Dados FRED buscados pelo servidor e guardados em cache (poucas
vezes por dia).

## Etapa 3 — delta e liquidações
- **Delta / CVD:** das negociações agregadas da Binance Futures (compras − vendas agressoras)
  por vela.
- **Heatmap de liquidações (estimado):** níveis de preço onde posições abertas seriam
  liquidadas, calculados do open interest e de faixas de alavancagem típicas; marcado
  "estimado" na tela.

## Fora do escopo
Ordens/corretagem, alertas, replay, scripts de indicadores escritos pelo usuário.

## Testes
Unitários para validação dos parâmetros, cálculo dos indicadores próprios (volume profile,
divergências), limites e validação do que é salvo; e2e: abrir a aba, trocar par/tempo, adicionar
indicador, mudar layout para 4, criar aba, recarregar e ver tudo salvo.
