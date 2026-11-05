import { expect, test } from "@playwright/test";

test("login, adicionar ativo, ver dashboard, trocar período e sair", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // Login errado
  await page.getByLabel("Usuário").fill("admin");
  await page.getByLabel("Senha").fill("errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Usuário ou senha inválidos")).toBeVisible();
  await expect(page.getByLabel("Usuário")).toHaveValue("admin");

  // Login certo → carteira vazia
  await page.getByLabel("Senha").fill("senha-forte-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Adicione seu primeiro ativo")).toBeVisible();

  // Adicionar 0,5 BTC
  await page.goto("/ativos");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();
  await page.getByLabel("Moeda").fill("bit");
  await page.getByRole("option", { name: /Bitcoin/ }).click();
  await page.getByLabel(/Quantidade de BTC/).fill("0,5");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: /Bitcoin/ })).toContainText("0,5");

  // Dashboard
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("US$ 30.000,00");
  const btc = page.getByRole("row", { name: /BTC/ });
  await expect(btc).toContainText("100,00%");
  await expect(btc).toContainText("US$ 60.000,00");
  await expect(page.getByTestId("capital-chart")).toBeVisible();

  // Trocar período
  await page.getByRole("link", { name: "7D", exact: true }).click();
  await expect(page).toHaveURL(/periodo=7D/);
  await expect(page.getByTestId("capital-chart")).toBeVisible();

  // Sair
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
