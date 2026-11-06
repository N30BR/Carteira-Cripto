CREATE TABLE `module_prefs` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`disabled` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
