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
  await page.getByRole("link", { name: "7D", exact: true }).click();
  await expect(page).toHaveURL(/periodo=7D/);

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

  // Sair
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/fiduciario");
  await expect(page).toHaveURL(/\/login$/);
});
