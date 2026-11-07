import { expect, test } from "@playwright/test";

test("login, cripto, fiduciário, moeda de referência e sair", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // Login errado mantém o usuário digitado
  await page.getByLabel("Usuário").fill("admin");
  await page.getByLabel("Senha").fill("errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Usuário ou senha inválidos")).toBeVisible();
  await expect(page.getByLabel("Usuário")).toHaveValue("admin");

  // Login certo → carteira vazia
  await page.getByLabel("Senha").fill("senha-forte-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Adicione seu primeiro ativo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Portfólio" })).toBeVisible();

  // Adicionar 0,5 BTC
  await page.goto("/ativos");
  await page.getByRole("button", { name: "Adicionar fundos" }).click();
  await page.getByLabel("Moeda").fill("btc");
  await page.getByRole("option", { name: /BTC/ }).click();
  await page.getByLabel(/Quantidade de BTC/).fill("0,5");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: /BTC/ })).toContainText("0,5");

  // Nova conta fiduciária
  await page.getByRole("button", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill("Conta PF");
  await page.getByLabel("Saldo (R$)").fill("5.000,00");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByRole("row", { name: /Conta PF/ })).toContainText("R$ 5.000,00");

  // Dashboard Cripto em USDT (padrão)
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("US$ 30.000,00");
  const btc = page.getByRole("row", { name: /BTC/ });
  await expect(btc).toContainText("100,00%");
  await expect(btc).toContainText("US$ 60.000,00");
  await expect(page.getByTestId("capital-chart")).toBeVisible();

  // Modo discreto (olho no topo): valores pessoais escondidos em todas as abas; preço de mercado visível
  const afterContent = (sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el, "::after").content);
  await page.getByRole("button", { name: "Modo discreto" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-discreet", "");
  expect(await afterContent("[data-testid=total] .priv")).toBe('"***"');
  expect(await afterContent("header .priv")).toBe('"***"'); // nome do usuário escondido
  expect(await afterContent("tbody .priv")).toBe('"***"');
  await expect(page.getByRole("row", { name: /BTC/ })).toContainText("US$ 60.000,00"); // preço continua visível
  // percentuais continuam visíveis (participação e variações)
  expect(await page.getByRole("row", { name: /BTC/ }).locator("td").nth(4).evaluate((el) => getComputedStyle(el.querySelector("*") ?? el, "::after").content)).toBe("none");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-discreet", "");
  await page.getByRole("link", { name: "Dashboard fiduciário" }).click();
  await expect(page).toHaveURL(/fiduciario/);
  await expect(page.locator("tbody .priv").first()).toBeVisible();
  expect(await afterContent("tbody .priv")).toBe('"***"');
  await page.goto("/");
  await page.getByRole("button", { name: "Mostrar valores" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-discreet", "");
  expect(await afterContent("[data-testid=total] .priv")).toBe("none");

  // Período
  await page.getByRole("link", { name: "1S", exact: true }).click();
  await expect(page).toHaveURL(/periodo=1S/);
  await expect(page.getByTestId("total-changes")).toContainText("1S");
  await page.getByRole("link", { name: "6M", exact: true }).click();
  await expect(page).toHaveURL(/periodo=6M/);

  // Escolher as variações da tabela pela seta ao lado de "Ativos"
  const heads = page.locator("thead th");
  await expect(heads).toHaveText(["Ativo", "Quantidade", "Preço", "Saldo ↓", "%", "24H", "1S", "1M", "6M", "1A"]);
  await page.getByRole("button", { name: "Escolher períodos da tabela" }).click();
  await page.getByRole("button", { name: "Ocultar 1S" }).click();
  await expect(heads).toHaveText(["Ativo", "Quantidade", "Preço", "Saldo ↓", "%", "24H", "1M", "6M", "1A"]);
  await page.reload();
  await expect(heads).toHaveCount(9);
  await page.getByRole("button", { name: "Escolher períodos da tabela" }).click();
  await page.getByRole("button", { name: "Mostrar 1S" }).click();
  await expect(heads).toHaveCount(10);
  await page.keyboard.press("Escape");

  // Trocar o Cripto para BRL (1 USDT = R$ 5)
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /BRL/ }).click();
  await expect(page).toHaveURL(/moeda=BRL/);
  await expect(page.getByTestId("total")).toHaveText("R$ 150.000,00");

  // Dashboard $ em BRL (padrão dele, independente do Cripto) e em USDT
  await page.getByRole("link", { name: "Dashboard fiduciário" }).click();
  await expect(page).toHaveURL(/\/fiduciario/);
  await expect(page.getByTestId("total")).toHaveText("R$ 5.000,00");
  await expect(page.getByRole("row", { name: /Conta PF/ })).toContainText("100,00%");
  // Seta ao lado de "Contas": escolher as variações da tabela (1M, 2M, 3M, 1A)
  const fiatHeads = page.locator("thead th");
  await expect(fiatHeads).toHaveText(["Conta", "Saldo", "%", "Atualizado em", "1M", "2M", "3M", "1A"]);
  await page.getByRole("button", { name: "Escolher períodos da tabela" }).click();
  await page.getByRole("button", { name: "Ocultar 2M" }).click();
  await expect(fiatHeads).toHaveText(["Conta", "Saldo", "%", "Atualizado em", "1M", "3M", "1A"]);
  await page.reload();
  await expect(fiatHeads).toHaveCount(7);
  await page.getByRole("button", { name: "Escolher períodos da tabela" }).click();
  await page.getByRole("button", { name: "Mostrar 2M" }).click();
  await expect(fiatHeads).toHaveCount(8);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page.getByTestId("total")).toHaveText("US$ 1.000,00");

  // O Cripto lembra a moeda escolhida
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("R$ 150.000,00");

  // Lançamentos: compra de R$ 1.200,00 em 3× no Cartão PJ
  await page.getByRole("link", { name: "Lançamentos" }).click();
  await expect(page.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Faturas", exact: true })).toBeVisible();
  // Cadastro em janela: "+ Nova Fatura" abre o formulário completo
  await page.getByRole("button", { name: "Nova Fatura" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Nova Fatura" })).toBeVisible();
  await page.getByLabel("Descrição do custo *").fill("Cadeira");
  await page.locator("#exp-amount").fill("1.200,00");
  await page.getByLabel("Total de parcelas", { exact: true }).fill("3");
  await page.getByRole("radio", { name: "o total" }).click();
  await page.selectOption("#exp-account", { label: "Cartão PJ" });
  await page.getByRole("button", { name: "Salvar Fatura" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const cadeira = page.getByRole("row", { name: /Cadeira/ });
  await expect(cadeira).toContainText("R$ 400,00");
  await expect(cadeira).toContainText("1 / 3");
  // Fechamento e vencimento do Cartão PJ: fecha dia 3, vence dia 10 (no próprio mês da fatura)
  await page.getByLabel("Dia de fechamento de Cartão PJ").fill("3");
  await page.getByLabel("Dia de fechamento de Cartão PJ").press("Enter");
  await page.getByLabel("Dia de vencimento de Cartão PJ").fill("10");
  await page.getByLabel("Dia de vencimento de Cartão PJ").press("Enter");
  await expect(page.getByRole("row", { name: /Cadeira/ })).toContainText("vence 10/");
  // Editar abre a mesma janela, com o valor do jeito que foi lançado (aqui, o total)
  await page.getByRole("button", { name: "Editar Cadeira" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Editar Fatura" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("radio", { name: "o total" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#exp-desc")).toHaveValue("Cadeira");
  await page.keyboard.press("Escape");
  await expect(cadeira).toContainText("Cartão PJ");
  await expect(page.getByTestId("month-total")).toHaveText("Total: R$ 400,00");
  // "Paga" desconta a parcela da conta do cartão no R$ (Cartão PJ, criada lá com o mesmo nome)
  await cadeira.getByLabel(/^Paga:/).click();
  await expect(page.getByRole("row", { name: /Cadeira/ }).getByLabel(/^Paga:/)).toBeChecked();
  await expect(page.getByRole("row", { name: /Cadeira/ }).getByLabel(/^Quitada:/)).not.toBeChecked();
  // Até a última parcela: paga a 1ª de 3, faltam 2 (R$ 800,00)
  await expect(page.getByRole("row", { name: /Cadeira/ })).toContainText("faltam 2 • R$ 800,00");

  // Contas: cadastrar uma terceira conta pelo "+ Adicionar" (dentro da janela de Nova Fatura)
  await page.getByRole("button", { name: "Nova Fatura" }).click();
  await page.getByRole("button", { name: "Gerenciar contas" }).click();
  await page.getByLabel("Nova conta", { exact: true }).fill("Nubank");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByLabel("Nome da conta Nubank")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#exp-account option")).toHaveText(["Cartão PF", "Cartão PJ", "Nubank"]);
  // Excluir a conta escolhida no formulário: ele volta para a primeira conta
  await page.selectOption("#exp-account", { label: "Nubank" });
  await page.getByRole("button", { name: "Gerenciar contas" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem").filter({ has: page.getByLabel("Nome da conta Nubank") }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByLabel("Nome da conta Nubank")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#exp-account option:checked")).toHaveText("Cartão PF");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Lançamento de Transações: uma entrada e uma saída, na conta "Conta PF" do R$ (o saldo dela muda)
  const tx = async (kind: "in" | "out", description: string, amount: string) => {
    await page.getByRole("button", { name: "Nova Transação" }).click();
    await page.selectOption("#tx-kind", kind);
    await page.selectOption("#tx-account", { label: "Conta PF" });
    await page.locator("#tx-desc").fill(description);
    await page.locator("#tx-amount").fill(amount);
    await page.getByRole("button", { name: "Salvar Transação" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Transações" }).getByRole("row", { name: new RegExp(description) })).toBeVisible();
  };
  await tx("in", "Recebimento de serviço", "2.500,00");
  await tx("out", "Pagamento de fornecedor", "780");
  const txTable = page.getByRole("table", { name: "Transações" });
  await expect(txTable.getByRole("row", { name: /Recebimento/ })).toContainText("+ R$ 2.500,00");
  await expect(txTable.getByRole("row", { name: /Pagamento/ })).toContainText("- R$ 780,00");

  // Faturas: o mesmo gasto aparece no Cartão PJ; os próximos 2 meses ficam na projeção
  await page.getByRole("link", { name: "Faturas" }).click();
  await expect(page.getByTestId("invoice-total")).toHaveText("R$ 400,00");
  await expect(page.getByTestId("account-total-1")).toHaveText("R$ 400,00");
  await expect(page.getByTestId("account-total-0")).toHaveText("R$ 0,00");
  await expect(page.getByText("1 compra parcelada ativa")).toBeVisible();
  await expect(page.getByTestId("open-total")).toHaveText("R$ 800,00");
  await expect(page.getByRole("table", { name: "Compras em aberto" }).getByRole("row", { name: /Cadeira/ })).toContainText("1 / 3");
  // Faturas em USDT (1 USDT = R$ 5) e com período de 3 meses: as 3 parcelas da cadeira
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page.getByTestId("invoice-total")).toHaveText("US$ 80,00");
  await page.getByRole("link", { name: "3M", exact: true }).click();
  await expect(page).toHaveURL(/periodo=3M/);
  await expect(page.getByTestId("invoice-total")).toHaveText("US$ 240,00");

  // Transações: indicadores do mês
  await page.getByRole("link", { name: "Transações" }).click();
  await expect(page.getByTestId("tx-inflow")).toHaveText("+ R$ 2.500,00");
  await expect(page.getByTestId("tx-outflow")).toHaveText("- R$ 780,00");
  await expect(page.getByTestId("tx-balance")).toHaveText("+ R$ 1.720,00");
  await expect(page.getByRole("button", { name: "Saídas (1)" })).toBeVisible();
  // Transações em USDT; o padrão é BRL e cada aba lembra a sua moeda
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page.getByTestId("tx-balance")).toHaveText("+ US$ 344,00");
  await expect(page.getByRole("table", { name: "Transações" })).toContainText("+ US$ 500,00");
  await page.getByRole("link", { name: "3M", exact: true }).click();
  await expect(page).toHaveURL(/periodo=3M/);
  await expect(page.getByTestId("tx-balance")).toHaveText("+ US$ 344,00");

  // Resumo: saldo cripto 150.000 + reais 6.720 (5.000 + entrada 2.500 − saída 780, já na conta; neutros) − fatura 400
  // (vence dia 10 deste mês). As transações com conta não entram de novo em Entradas/Saídas (sem contar duas vezes).
  await page.getByRole("link", { name: "Resumo" }).click();
  // Saldo R$: 6.720 − a parcela paga da cadeira (400, descontada do Cartão PJ). Ela não entra de novo em Faturas.
  await expect(page.getByTestId("sum-fiat").first()).toHaveText("R$ 6.320,00");
  await expect(page.getByTestId("sum-crypto").first()).not.toContainText("+");
  await expect(page.getByTestId("sum-variation").first()).toBeVisible();
  await expect(page.getByTestId("sum-invoices").first()).toHaveText("R$ 0,00");
  await expect(page.getByTestId("sum-result")).toHaveText("+ R$ 156.320,00");
  await expect(page.getByText("Consolidação estimada (sem conciliação)")).toBeVisible();
  // Em USDT (1 USDT = R$ 5) e com período de 1 ano a partir do mês
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page).toHaveURL(/moeda=USDT/);
  await expect(page.getByTestId("sum-result")).toHaveText("+ US$ 31.264,00");
  await page.getByRole("link", { name: "1A", exact: true }).click();
  await expect(page).toHaveURL(/periodo=1A/);
  // Em 1 ano vencem as 2 parcelas ainda não pagas da cadeira (R$ 800 = US$ 160); a 1ª já saiu do saldo.
  await expect(page.getByTestId("sum-invoices").first()).toHaveText("- US$ 160,00");
  await expect(page.getByTestId("sum-result")).toHaveText("+ US$ 31.104,00");
  await expect(page.getByText(/Totais do período \(01\//)).toBeVisible();

  // Gráficos: velas desenhadas, layout 4, indicador, nova aba; tudo salvo na conta
  await page.getByRole("link", { name: "Gráficos" }).click();
  await expect(page.getByTestId("chart-pane")).toHaveCount(1);
  await expect(page.getByTestId("chart-pane").locator("canvas").first()).toBeVisible();
  await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "4" }).click();
  await expect(page.getByTestId("chart-pane")).toHaveCount(4);
  await page.getByRole("button", { name: /Indicadores/ }).click();
  await page.getByRole("button", { name: /^RSI\s*painel$/ }).click();
  await expect(page.getByRole("list", { name: "Indicadores no gráfico" }).getByText("RSI", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  // Delta e heatmap de liquidações (estimado, com o open interest da Binance Futures)
  await page.getByRole("button", { name: /^Indicadores/ }).click();
  await page.getByRole("button", { name: /^Heatmap de liquidações/ }).click();
  await page.getByRole("button", { name: /^Volume Delta/ }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await expect(page.getByText(/Liquidações:/)).toHaveCount(0);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "/q-liq.png" });
  await page.getByRole("button", { name: /^Indicadores/ }).click();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /^Remover/ }).last().click();
  await page.keyboard.press("Escape");

  // Comparar: ouro (PAXG) sobre o preço; juros sem chave do FRED mostram aviso, sem quebrar
  await page.getByRole("button", { name: /^Comparar/ }).click();
  await page.getByRole("button", { name: "Ouro (PAXG/USDT) Binance" }).click();
  // Os demais instrumentos ficam na busca "Procurar instrumento" (pelo nome ou pelo símbolo).
  await page.getByLabel("Procurar instrumento").fill("treasury");
  await page.getByRole("list", { name: "Resultados da busca" }).getByRole("button", { name: /Treasury 10 anos/ }).click();
  await expect(page.getByRole("list", { name: "Comparações no gráfico" }).locator("li")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Comparação UST10Y: Chave do FRED não configurada/)).toBeVisible();
  await expect(page.getByText(/Comparação PAXGUSDT/)).toHaveCount(0);
  await page.getByRole("button", { name: "Nova aba" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.waitForTimeout(1500); // salvamento automático (~1 s)
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab").first().getByRole("button").first().click();
  await expect(page.getByTestId("chart-pane")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Indicadores (2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar (2)" })).toBeVisible();

  // Desenho: com a ferramenta ativa o 1º clique marca o ponto (mesmo com o mouse tremendo);
  // clique seleciona e mostra a barra rápida; Ctrl+D duplica; Delete exclui.
  await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByTestId("chart-pane")).toHaveCount(1);
  await page.waitForTimeout(800);
  const paneBox = (await page.getByTestId("chart-pane").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: paneBox.x + paneBox.width * fx, y: paneBox.y + paneBox.height * fy });
  const a = at(0.25, 0.3);
  const z = at(0.5, 0.2);
  await page.getByRole("button", { name: "Linha de tendência" }).first().click();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 4, a.y + 3); // clique "tremido" (a biblioteca descartaria)
  await page.mouse.up();
  await page.mouse.move(z.x, z.y, { steps: 5 });
  await page.mouse.click(z.x, z.y);
  await expect(page.getByTestId("object-toolbar")).toBeVisible(); // recém-desenhado fica selecionado
  // Trocar a cor e clicar fora UMA vez fecha o seletor (antes eram 2 ou 3 cliques)
  await page.getByTestId("object-toolbar").getByRole("button", { name: "Cor da linha" }).click();
  await page.getByRole("button", { name: "Cor #f23645" }).click();
  await page.getByText(/\d+\/10 abas/).click();
  await expect(page.locator('[role="menu"][data-state="open"]')).toHaveCount(0);
  await page.keyboard.press("Control+d");
  await page.getByRole("button", { name: "Lista de desenhos" }).click();
  await expect(page.getByRole("list", { name: "Lista de desenhos" }).getByRole("listitem")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Lista de desenhos" }).click();
  await expect(page.getByRole("list", { name: "Lista de desenhos" }).getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // Tempos da barra: 15 no menu, no máximo 8 marcados
  await page.getByRole("button", { name: "Personalizar tempos" }).click();
  await expect(page.getByRole("menuitemcheckbox")).toHaveCount(15);
  await page.keyboard.press("Escape");

  // Atalhos: só pelo menu de perfil (não é aba)
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("menuitem", { name: "Atalhos" }).click();
  await expect(page.getByRole("heading", { name: "Atalhos de Teclado" })).toBeVisible();
  await page.getByLabel("Buscar atalho").fill("duplicar");
  await expect(page.getByText("Duplicar objeto")).toBeVisible();

  // Referências: logo abaixo de Atalhos no menu de perfil; página interna com as 3 imagens, ampliáveis
  await page.getByRole("button", { name: /admin/ }).click();
  const menuItems = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  expect(menuItems.indexOf("Referências")).toBe(menuItems.indexOf("Atalhos") + 1);
  await page.getByRole("menuitem", { name: "Referências" }).click();
  await expect(page.getByRole("heading", { name: "Referências", exact: true })).toBeVisible();
  for (const src of ["ondas-de-elliott", "wyckoff-1", "wyckoff-2"]) {
    const img = page.locator(`img[src="/referencias/${src}.webp"]`).first();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(1000);
  }
  await page.getByRole("button", { name: /^Ampliar: Ondas de Elliott/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Pendências: tarefa com checklist, progresso, concluir e nota rápida que vira tarefa
  await page.getByRole("link", { name: "Pendências" }).click();
  await expect(page.getByText("Nenhuma tarefa ainda")).toBeVisible();
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  await page.getByLabel("Título da nova tarefa").fill("Enviar orçamento");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  const tasks = page.getByRole("list", { name: "Tarefas" });
  await expect(tasks.locator("li")).toHaveCount(1);
  for (const item of ["Separar documentos", "Revisar valores"]) {
    await page.getByLabel("Novo item do checklist").fill(item);
    await page.getByRole("button", { name: "Adicionar item" }).click();
    await expect(page.getByLabel(`Marcar ${item}`)).toBeVisible();
  }
  await page.getByLabel("Marcar Separar documentos").check();
  await expect(page.getByTestId("detail-progress")).toHaveText("50%");
  await expect(page.getByTestId("ind-inProgress")).toHaveText("1");
  await page.getByLabel("Concluir Enviar orçamento").check();
  await expect(page.getByTestId("ind-done")).toHaveText("1");
  await expect(page.getByTestId("detail-progress")).toHaveText("100%");
  await page.getByRole("button", { name: "Nova nota rápida" }).click();
  await page.getByLabel("Texto da nota rápida").fill("Pesquisar cursos de IA");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Virar tarefa" }).click();
  await expect(tasks.locator("li").first()).toContainText("Pesquisar cursos de IA");
  await expect(tasks.locator("li").last()).toContainText("Enviar orçamento");

  // Página Sobre: a logo abre /sobre na mesma guia, com os 8 módulos como links
  await page.getByRole("link", { name: "Sobre o BlackHole Dashboard" }).click();
  await expect(page).toHaveURL(/\/sobre$/);
  await expect(page.getByText("Concentrar sinais essenciais, reduzir fragmentação")).toBeVisible();
  await expect(page.locator("main").getByRole("listitem")).toHaveCount(8);
  await expect(page.locator("main").getByRole("link", { name: "Faturas" })).toHaveAttribute("href", "/faturas");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "/sobre.png", fullPage: true });
  if (process.env.SHOT) {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: process.env.SHOT + "/sobre-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Personalizar abas: desligar Portfólio esconde a aba, o cartão, a seção em Ativos e o saldo no Resumo
  const nav = page.getByRole("navigation", { name: "Principal" });
  const toggle = async (name: string) => {
    await page.getByRole("button", { name: "Personalizar abas" }).click();
    await page.getByRole("menuitemcheckbox", { name }).click();
    await page.keyboard.press("Escape");
  };
  await toggle("Portfólio");
  await expect(nav.getByRole("link", { name: "Portfólio", exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("link", { name: "Portfólio" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Lançamentos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ativos" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/fiduciario$/); // URL direta de módulo desligado → primeira aba ativa
  await page.goto("/ativos");
  await expect(page.getByRole("button", { name: "Adicionar fundos" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Conta PF/ })).toBeVisible();
  await page.goto("/resumo");
  await expect(page.getByText(/Fora da conta \(módulo desligado/)).toContainText("Portfólio");
  await expect(page.getByTestId("sum-crypto")).toHaveCount(0);

  // Desligar a aba em que está: vai para uma aba ativa; a escolha continua depois de recarregar
  await toggle("Resumo");
  await expect(page).toHaveURL(/\/fiduciario$/);
  await page.reload();
  await expect(nav.getByRole("link", { name: "Resumo" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Portfólio", exact: true })).toHaveCount(0);

  // Ativos sem nenhum módulo: estado vazio, sem erro
  await toggle("R$ / Fiduciário");
  await expect(page).toHaveURL(/\/faturas$/);
  await page.goto("/ativos");
  await expect(page.getByText(/Os módulos Portfólio e R\$ \/ Fiduciário estão desligados/)).toBeVisible();

  // O olho continua só cuidando da privacidade dos valores
  await page.getByRole("button", { name: "Modo discreto" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-discreet", "");
  await page.getByRole("button", { name: "Mostrar valores" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-discreet", "");

  // Religar: tudo volta com os dados de antes
  for (const name of ["Portfólio", "R$ / Fiduciário", "Resumo"]) await toggle(name);
  await page.goto("/ativos");
  await expect(page.getByRole("row", { name: /BTC/ })).toContainText("0,5");
  await expect(page.getByRole("row", { name: /Conta PF/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Portfólio", exact: true })).toBeVisible();

  // Admin: cria uma conta comum (sem marcar administrador)
  await page.goto("/admin");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await page.getByRole("dialog").getByLabel("Usuário").fill("comum");
  await page.getByRole("dialog").getByLabel("Senha").fill("senha-comum-123");
  await page.getByRole("dialog").getByRole("button", { name: "Criar" }).click();
  await expect(page.getByRole("cell", { name: "comum", exact: true })).toBeVisible();

  // Sair
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/fiduciario");
  await expect(page).toHaveURL(/\/login$/);

  // Conta comum: não vê nem acessa o Admin (nem pela URL); a personalização do admin não vale para ela
  await page.getByLabel("Usuário").fill("comum");
  await page.getByLabel("Senha").fill("senha-comum-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(nav.getByRole("link", { name: "Portfólio", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});
