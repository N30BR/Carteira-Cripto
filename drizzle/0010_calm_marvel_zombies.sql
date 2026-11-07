CREATE TABLE `account_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `fiat_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_movements_source` ON `account_movements` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `account_movements_account` ON `account_movements` (`account_id`);--> statement-breakpoint
ALTER TABLE `card_accounts` ADD `fiat_account_id` integer REFERENCES fiat_accounts(id);--> statement-breakpoint
ALTER TABLE `card_installments` ADD `settled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` integer REFERENCES fiat_accounts(id);