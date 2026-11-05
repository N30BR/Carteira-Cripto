CREATE TABLE `card_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_accounts_user_name` ON `card_accounts` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transactions_user_date` ON `transactions` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `card_expenses` ADD `account_id` integer REFERENCES card_accounts(id);--> statement-breakpoint
CREATE INDEX `card_expenses_account` ON `card_expenses` (`account_id`);--> statement-breakpoint
-- Dados: quem já tem compras ganha as contas "Cartão PF" e "Cartão PJ", e cada compra é ligada à conta
-- do cartão que já tinha (a natureza PF/PJ de cada compra não muda).
INSERT INTO `card_accounts` (`user_id`, `name`, `kind`, `created_at`)
SELECT DISTINCT `user_id`, 'Cartão PF', 'PF', CAST(strftime('%s', 'now') AS integer) * 1000 FROM `card_expenses` ORDER BY `user_id`;--> statement-breakpoint
INSERT INTO `card_accounts` (`user_id`, `name`, `kind`, `created_at`)
SELECT DISTINCT `user_id`, 'Cartão PJ', 'PJ', CAST(strftime('%s', 'now') AS integer) * 1000 FROM `card_expenses` ORDER BY `user_id`;--> statement-breakpoint
UPDATE `card_expenses` SET `account_id` = (
  SELECT `a`.`id` FROM `card_accounts` `a`
  WHERE `a`.`user_id` = `card_expenses`.`user_id` AND `a`.`kind` = `card_expenses`.`card` AND `a`.`name` = 'Cartão ' || `card_expenses`.`card`
);
