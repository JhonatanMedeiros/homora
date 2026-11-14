CREATE TABLE `measurement_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`reason` text NOT NULL,
	`failing` integer NOT NULL,
	`measured` integer NOT NULL,
	`monitors` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `measurement_incidents_started_idx` ON `measurement_incidents` (`started_at`);