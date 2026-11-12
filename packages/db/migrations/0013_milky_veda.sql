CREATE TABLE `service_observation_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer NOT NULL,
	`signature` text NOT NULL,
	`observed_at` integer NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observation_history_service_time_idx` ON `service_observation_history` (`service_id`,`observed_at`,`signature`);--> statement-breakpoint
CREATE INDEX `observation_history_time_idx` ON `service_observation_history` (`observed_at`);--> statement-breakpoint
ALTER TABLE `service_proposals` ADD `batch_id` text;--> statement-breakpoint
DROP TRIGGER `service_proposal_immutable`;
--> statement-breakpoint
CREATE TRIGGER `service_proposal_immutable` BEFORE UPDATE OF `author_id`, `diff`, `base_hash`, `base_version`, `created_at`, `batch_id` ON `service_proposals` BEGIN SELECT RAISE(ABORT, 'proposal contents are immutable'); END;
