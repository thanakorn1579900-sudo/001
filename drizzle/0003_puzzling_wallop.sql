ALTER TABLE `teacher_accounts` ADD `exam_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_teacher_accounts_public` ON `teacher_accounts` (`status`,`exam_enabled`);