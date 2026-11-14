ALTER TABLE `services` ADD `alias` text;--> statement-breakpoint
CREATE UNIQUE INDEX `services_alias_unique` ON `services` (`alias`);