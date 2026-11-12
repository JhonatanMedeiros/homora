CREATE TABLE `pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_name_nocase_idx` ON `pages` ("name" COLLATE NOCASE);--> statement-breakpoint
ALTER TABLE `service_groups` ADD `page_id` integer REFERENCES pages(id);--> statement-breakpoint
INSERT INTO `pages` (`id`, `name`, `position`) VALUES (1, 'Home', 0);--> statement-breakpoint
UPDATE `service_groups` SET `page_id` = 1;
