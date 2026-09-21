CREATE TABLE `catalog_exam_overrides` (
	`subject_id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`questions_json` text NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_exam_overrides_teacher_visible` ON `catalog_exam_overrides` (`teacher_id`,`is_visible`);