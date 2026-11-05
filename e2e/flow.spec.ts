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

  // Lançamentos: compra de R$ 1.200,00 em 3× no Cartão PJ, natureza PF
  await page.getByRole("link", { name: "Lançamentos" }).click();
  await expect(page.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Descrição do custo *").fill("Cadeira");
  await page.getByLabel("Valor (R$) *").fill("1.200,00");
  await page.getByLabel("Total de parcelas", { exact: true }).fill("3");
  await page.getByRole("radio", { name: "o total" }).click();
  await page.selectOption("#exp-card", "PJ");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  const cadeira = page.getByRole("row", { name: /Cadeira/ });
  await expect(cadeira).toContainText("R$ 400,00");
  await expect(cadeira).toContainText("1/3");
  await expect(page.getByTestId("month-total")).toHaveText("Total: R$ 400,00");
  await cadeira.getByRole("button", { name: "Pendente" }).click();
  await expect(page.getByRole("row", { name: /Cadeira/ }).getByRole("button", { name: "Pago" })).toBeVisible();

  // Faturas: o mesmo gasto aparece no Cartão PJ; os próximos 2 meses ficam na projeção
  await page.getByRole("link", { name: "Faturas" }).click();
  await expect(page.getByTestId("invoice-total")).toHaveText("R$ 400,00");
  await expect(page.getByTestId("card-PJ-total")).toHaveText("R$ 400,00");
  await expect(page.getByTestId("card-PF-total")).toHaveText("R$ 0,00");
  await expect(page.getByText("1 compra parcelada ativa")).toBeVisible();

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
