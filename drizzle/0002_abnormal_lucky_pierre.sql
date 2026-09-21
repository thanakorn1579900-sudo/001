CREATE TABLE `teacher_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_teacher_accounts_email` ON `teacher_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `idx_teacher_accounts_status` ON `teacher_accounts` (`status`);--> statement-breakpoint
ALTER TABLE `uploaded_exams` ADD `teacher_id` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_uploaded_exams_teacher_created` ON `uploaded_exams` (`teacher_id`,`created_at`);