import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
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

/** Compra de origem (à vista ou parcelada). */
export const cardExpenses = sqliteTable("card_expenses", {
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
  /** Cartão usado: PF ou PJ */
  card: text("card").notNull(),
  categoryId: integer("category_id").references(() => cardCategories.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

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
  },
  (t) => [uniqueIndex("card_installments_expense_number").on(t.expenseId, t.number)],
);
