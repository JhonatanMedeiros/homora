CREATE TABLE `integration_resource_links` (
	`id` integer PRIMARY KEY NOT NULL,
	`service_id` integer NOT NULL,
	`integration_id` integer NOT NULL,
	`resource_uuid` text NOT NULL,
	`resource_type` text NOT NULL,
	`seen_name` text NOT NULL,
	`seen_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_resource_links_service_idx` ON `integration_resource_links` (`service_id`);--> statement-breakpoint
CREATE INDEX `integration_resource_links_resource_idx` ON `integration_resource_links` (`integration_id`,`resource_uuid`);