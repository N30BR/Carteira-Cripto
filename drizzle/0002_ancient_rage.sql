CREATE TABLE `card_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_categories_user_name` ON `card_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `card_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`total_cents` integer NOT NULL,
	`installments` integer NOT NULL,
	`first_invoice` text NOT NULL,
	`purchase_date` text NOT NULL,
	`nature` text NOT NULL,
	`card` text NOT NULL,
	`category_id` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `card_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `card_installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_id` integer NOT NULL,
	`number` integer NOT NULL,
	`invoice_month` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `card_expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_installments_expense_number` ON `card_installments` (`expense_id`,`number`);