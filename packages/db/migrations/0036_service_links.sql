CREATE TABLE `link_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_types_name_nocase_idx` ON `link_types` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `service_links` (
	`id` integer PRIMARY KEY NOT NULL,
	`service_id` integer NOT NULL,
	`type_id` integer,
	`name` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`open_target` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `link_types`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `service_links_service_idx` ON `service_links` (`service_id`,`position`);