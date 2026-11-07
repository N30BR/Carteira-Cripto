ALTER TABLE `sessions` ADD `last_active_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `lock_minutes` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_step` integer;