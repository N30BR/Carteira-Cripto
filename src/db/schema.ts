import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  /** As categorias padrão já foram criadas uma vez (não recriar se a pessoa apagar todas). */
  todoDefaultsSeeded: integer("todo_defaults_seeded", { mode: "boolean" }).notNull().default(false),
  cardDefaultsSeeded: integer("card_defaults_seeded", { mode: "boolean" }).notNull().default(false),
  /** Bloqueio por inatividade: minutos sem interação real (1, 5, 10, 15 ou 30). */
  lockMinutes: integer("lock_minutes").notNull().default(10),
  /** Verificação em duas etapas (TOTP, opcional): segredo em base32; só vale com totpEnabled. */
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  /** Último intervalo de 30 s já usado (um código não vale duas vezes). */
  totpLastStep: integer("totp_last_step"),
  /** E-mail de recuperação VERIFICADO (minúsculas). Só ele recebe links de redefinição. */
  email: text("email").unique(),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
  /** E-mail novo aguardando confirmação pelo link (não vale para nada até ser confirmado). */
  pendingEmail: text("pending_email"),
});

/**
 * Links de uso único enviados por e-mail (confirmar e-mail, redefinir senha). Só o hash SHA-256 do token fica no banco;
 * usedAt marca o consumo (atômico); expiresAt limita a validade.
 */
export const accountTokens = sqliteTable("account_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** E-mail a confirmar (verify_email). */
  email: text("email"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

/** Auditoria de segurança da conta (sem senhas, tokens nem links). */
export const securityEvents = sqliteTable("security_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  event: text("event").notNull(),
  ip: text("ip"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  /** Última interação real da pessoa (não conta atualização automática de dados). Base do bloqueio por inatividade. */
  lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }),
});

export const holdings = sqliteTable(
  "holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coinId: text("coin_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    quantity: text("quantity").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("holdings_user_coin").on(t.userId, t.coinId)],
);

export const priceCache = sqliteTable("price_cache", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const fiatAccounts = sqliteTable(
  "fiat_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("fiat_accounts_user_name").on(t.userId, t.name)],
);

export const fiatBalances = sqliteTable(
  "fiat_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => fiatAccounts.id, { onDelete: "cascade" }),
    /** AAAA-MM-DD */
    date: text("date").notNull(),
    /** Reais com 2 casas, ex.: "5230.50" (pode ser negativo). */
    amount: text("amount").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("fiat_balances_account_date").on(t.accountId, t.date)],
);

export const cardCategories = sqliteTable(
  "card_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("card_categories_user_name").on(t.userId, t.name)],
);

/**
 * Cartões/contas das faturas (até 4 por pessoa). O id é estável: renomear não mexe nos lançamentos.
 * O tipo (PF/PJ) da conta vira a natureza das compras lançadas nela.
 */
export const cardAccounts = sqliteTable(
  "card_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** PF ou PJ */
    kind: text("kind").notNull(),
    /** Dia de fechamento da fatura (1–31): compras a partir dele vão para a fatura do mês seguinte. */
    closingDay: integer("closing_day"),
    /** Dia de vencimento da fatura (1–31), no próprio mês da fatura; null = não informado. */
    dueDay: integer("due_day"),
    /** Conta do R$ de onde saem as parcelas pagas (a mesma conta, compartilhada); null = ainda não ligada. */
    fiatAccountId: integer("fiat_account_id").references(() => fiatAccounts.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("card_accounts_user_name").on(t.userId, t.name)],
);

/** Compra de origem (à vista ou parcelada). */
export const cardExpenses = sqliteTable(
  "card_expenses",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  totalCents: integer("total_cents").notNull(),
  installments: integer("installments").notNull(),
  /** AAAA-MM */
  firstInvoice: text("first_invoice").notNull(),
  /** AAAA-MM-DD */
  purchaseDate: text("purchase_date").notNull(),
  /** Natureza da despesa: PF ou PJ */
  nature: text("nature").notNull(),
  /** Cartão usado: PF ou PJ (histórico; a conta de verdade é accountId) */
  card: text("card").notNull(),
  /** Conta/cartão da compra. Conta com lançamentos não pode ser excluída. */
  accountId: integer("account_id").references(() => cardAccounts.id),
  categoryId: integer("category_id").references(() => cardCategories.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  /** Como o valor foi informado: "parcela" ou "total" (null em compras antigas). */
  amountMode: text("amount_mode"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("card_expenses_user").on(t.userId),
    index("card_expenses_category").on(t.categoryId),
    index("card_expenses_account").on(t.accountId),
  ],
);

export const cardInstallments = sqliteTable(
  "card_installments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => cardExpenses.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** AAAA-MM */
    invoiceMonth: text("invoice_month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paid: integer("paid", { mode: "boolean" }).notNull().default(false),
    /** Quitada: obrigação encerrada sem mexer em saldo (exclusiva com "paga"). */
    settled: integer("settled", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("card_installments_expense_number").on(t.expenseId, t.number),
    index("card_installments_month").on(t.invoiceMonth),
  ],
);

/** Categorias e projetos das pendências. */
export const todoGroups = sqliteTable(
  "todo_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** category | project */
    kind: text("kind").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("todo_groups_user_kind_name").on(t.userId, t.kind, t.name)],
);

export const todoTasks = sqliteTable(
  "todo_tasks",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  categoryId: integer("category_id").references(() => todoGroups.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => todoGroups.id, { onDelete: "set null" }),
  /** 1 a 3 estrelas */
  priority: integer("priority").notNull().default(2),
  /** AAAA-MM-DD */
  dueDate: text("due_date"),
  /** HH:MM */
  dueTime: text("due_time"),
  /** pending | in_progress | done */
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("todo_tasks_user").on(t.userId),
    index("todo_tasks_category").on(t.categoryId),
    index("todo_tasks_project").on(t.projectId),
  ],
);

export const todoChecklist = sqliteTable(
  "todo_checklist",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => todoTasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull(),
  },
  (t) => [index("todo_checklist_task").on(t.taskId, t.position)],
);

export const todoNotes = sqliteTable(
  "todo_notes",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => todoTasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("todo_notes_task").on(t.taskId)],
);

/** Compromissos (reuniões, consultas, prazos) independentes das tarefas. */
export const todoEvents = sqliteTable(
  "todo_events",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** AAAA-MM-DD */
  date: text("date").notNull(),
  /** HH:MM */
  time: text("time"),
  categoryId: integer("category_id").references(() => todoGroups.id, { onDelete: "set null" }),
  description: text("description").notNull().default(""),
  /** scheduled | done | canceled */
  status: text("status").notNull().default("scheduled"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("todo_events_user").on(t.userId), index("todo_events_category").on(t.categoryId)],
);

export const quickNotes = sqliteTable(
  "quick_notes",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("quick_notes_user").on(t.userId)],
);

/** Entradas e saídas avulsas (receitas, pagamentos, transferências), separadas das faturas. */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** AAAA-MM-DD */
    date: text("date").notNull(),
    /** "in" (entrada) ou "out" (saída); o sinal vem daqui, o valor é sempre positivo */
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Conta do R$ de destino (entrada) ou origem (saída); null = sem conta (transações antigas). */
    accountId: integer("account_id").references(() => fiatAccounts.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("transactions_user_date").on(t.userId, t.date)],
);

/**
 * Movimentações das contas do R$ geradas pelo app (transação com conta, parcela paga). O saldo da conta é o
 * último saldo informado + as movimentações feitas depois dele. Uma origem gera no máximo uma movimentação.
 */
export const accountMovements = sqliteTable(
  "account_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: integer("account_id")
      .notNull()
      .references(() => fiatAccounts.id, { onDelete: "cascade" }),
    /** AAAA-MM-DD */
    date: text("date").notNull(),
    /** Centavos com sinal: entrada positiva, saída negativa. */
    amountCents: integer("amount_cents").notNull(),
    /** Origem: "tx" (transação) ou "inst" (parcela paga), com o id dela. */
    source: text("source").notNull(),
    sourceId: integer("source_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("account_movements_source").on(t.source, t.sourceId), index("account_movements_account").on(t.accountId)],
);

/** Abas da aba Gráficos (até 10 por pessoa): layout e estado de cada divisão, em JSON validado. */
export const chartTabs = sqliteTable(
  "chart_tabs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    state: text("state").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("chart_tabs_user").on(t.userId)],
);

/** Preferências da aba Gráficos por pessoa: ferramentas visíveis e favoritas, aba aberta. */
export const chartPrefs = sqliteTable("chart_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tools: text("tools").notNull(),
  activeTabId: integer("active_tab_id"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Módulos que o usuário desligou em "Personalizar abas" (lista JSON; vazio = tudo ligado). */
export const modulePrefs = sqliteTable("module_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  disabled: text("disabled").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
