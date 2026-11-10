ALTER TABLE `services` ADD `check_type` text DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `check_interval` integer;