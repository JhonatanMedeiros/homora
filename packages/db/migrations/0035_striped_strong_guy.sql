CREATE TABLE `page_widgets` (
	`id` integer PRIMARY KEY NOT NULL,
	`page_id` integer NOT NULL,
	`type` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`connection_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE restrict
);
