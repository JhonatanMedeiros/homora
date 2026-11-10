CREATE TABLE `service_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_groups_name_unique` ON `service_groups` (`name`);--> statement-breakpoint
ALTER TABLE `services` ADD `icon` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO service_groups (name, position) SELECT category, ROW_NUMBER() OVER (ORDER BY category) - 1 FROM (SELECT DISTINCT category FROM services);--> statement-breakpoint
WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY name, id) - 1 AS pos FROM services) UPDATE services SET position = (SELECT pos FROM ranked WHERE ranked.id = services.id);
