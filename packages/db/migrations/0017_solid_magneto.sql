CREATE TABLE `docker_push_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`received_at` integer,
	`inventory_version` integer DEFAULT 0 NOT NULL,
	`inventory` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `docker_push_sources_name_unique` ON `docker_push_sources` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `docker_push_sources_token_hash_unique` ON `docker_push_sources` (`token_hash`);