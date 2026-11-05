ALTER TABLE `users` ADD `todo_defaults_seeded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `card_defaults_seeded` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `card_expenses_user` ON `card_expenses` (`user_id`);--> statement-breakpoint
CREATE INDEX `card_expenses_category` ON `card_expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `card_installments_month` ON `card_installments` (`invoice_month`);--> statement-breakpoint
CREATE INDEX `quick_notes_user` ON `quick_notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_checklist_task` ON `todo_checklist` (`task_id`,`position`);--> statement-breakpoint
CREATE INDEX `todo_events_user` ON `todo_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_events_category` ON `todo_events` (`category_id`);--> statement-breakpoint
CREATE INDEX `todo_notes_task` ON `todo_notes` (`task_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_user` ON `todo_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_category` ON `todo_tasks` (`category_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_project` ON `todo_tasks` (`project_id`);