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
  await expect(page.getByRole("link", { name: "Cripto" })).toBeVisible();

  // Adicionar 0,5 BTC
  await page.goto("/ativos");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();
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

  // Período
  await page.getByRole("link", { name: "1S", exact: true }).click();
  await expect(page).toHaveURL(/periodo=1S/);
  await expect(page.getByTestId("total-changes")).toContainText("1S");
  await page.getByRole("link", { name: "6M", exact: true }).click();
  await expect(page).toHaveURL(/periodo=6M/);

  // Escolher as variações da tabela pela seta ao lado de "Ativos"
  const heads = page.locator("thead th");
  await expect(heads).toHaveText(["Ativo", "Quantidade", "Preço", "Valor ↓", "%", "24H", "1S", "1M", "6M", "1A"]);
  await page.getByRole("button", { name: "Escolher períodos da tabela" }).click();
  await page.getByRole("button", { name: "Ocultar 1S" }).click();
  await expect(heads).toHaveText(["Ativo", "Quantidade", "Preço", "Valor ↓", "%", "24H", "1M", "6M", "1A"]);
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
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page.getByTestId("total")).toHaveText("US$ 1.000,00");

  // O Cripto lembra a moeda escolhida
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("R$ 150.000,00");

  // Lançamentos: compra de R$ 1.200,00 em 3× no Cartão PJ
  await page.getByRole("link", { name: "Lançamentos" }).click();
  await expect(page.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Lançamento de Faturas" })).toBeVisible();
  await page.getByLabel("Descrição do custo *").fill("Cadeira");
  await page.locator("#exp-amount").fill("1.200,00");
  await page.getByLabel("Total de parcelas", { exact: true }).fill("3");
  await page.getByRole("radio", { name: "o total" }).click();
  await page.selectOption("#exp-account", { label: "Cartão PJ" });
  await page.getByRole("button", { name: "Lançar Fatura" }).click();
  const cadeira = page.getByRole("row", { name: /Cadeira/ });
  await expect(cadeira).toContainText("R$ 400,00");
  await expect(cadeira).toContainText("1 / 3");
  await expect(cadeira).toContainText("Cartão PJ");
  await expect(page.getByTestId("month-total")).toHaveText("Total: R$ 400,00");
  await cadeira.getByRole("button", { name: "Pendente" }).click();
  await expect(page.getByRole("row", { name: /Cadeira/ }).getByRole("button", { name: "Pago" })).toBeVisible();

  // Contas: cadastrar uma terceira conta pelo "+ Adicionar"
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

  // Lançamento de Transações: uma entrada e uma saída
  const tx = async (kind: "in" | "out", description: string, amount: string) => {
    await page.selectOption("#tx-kind", kind);
    await page.locator("#tx-desc").fill(description);
    await page.locator("#tx-amount").fill(amount);
    await page.getByRole("button", { name: "Lançar Transação" }).click();
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

  // Resumo: saldo cripto no início do mês + variação no mês = 150.000 (saldo de hoje);
  // + reais 5.000 (neutros) + entradas 2.500 − faturas 400 − saídas 780
  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(page.getByTestId("sum-fiat").first()).toHaveText("R$ 5.000,00");
  await expect(page.getByTestId("sum-crypto").first()).not.toContainText("+");
  await expect(page.getByTestId("sum-variation").first()).toBeVisible();
  await expect(page.getByTestId("sum-invoices").first()).toHaveText("- R$ 400,00");
  await expect(page.getByTestId("sum-result")).toHaveText("+ R$ 156.320,00");
  await expect(page.getByText("Consolidação estimada (sem conciliação)")).toBeVisible();
  // Em USDT (1 USDT = R$ 5) e com período de 1 ano a partir do mês
  await page.getByRole("button", { name: /Moeda de referência/ }).click();
  await page.getByRole("menuitemradio", { name: /USDT/ }).click();
  await expect(page).toHaveURL(/moeda=USDT/);
  await expect(page.getByTestId("sum-result")).toHaveText("+ US$ 31.264,00");
  await page.getByRole("link", { name: "1A", exact: true }).click();
  await expect(page).toHaveURL(/periodo=1A/);
  // Em 1 ano entram as 3 parcelas da cadeira (R$ 1.200 = US$ 240), não só a do mês (US$ 80).
  await expect(page.getByTestId("sum-invoices").first()).toHaveText("- US$ 240,00");
  await expect(page.getByTestId("sum-result")).toHaveText("+ US$ 31.104,00");
  await expect(page.getByText(/Totais do período \(01\//)).toBeVisible();

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

  // Sair
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/fiduciario");
  await expect(page).toHaveURL(/\/login$/);
});
