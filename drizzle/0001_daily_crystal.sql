CREATE TABLE `uploaded_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`source_file_name` text NOT NULL,
	`source_object_key` text NOT NULL,
	`question_count` integer NOT NULL,
	`questions_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_uploaded_exams_created_at` ON `uploaded_exams` (`created_at`);