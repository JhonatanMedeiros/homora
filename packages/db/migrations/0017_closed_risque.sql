CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`allow_private` integer DEFAULT false NOT NULL,
	`include_url` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`last_sent_at` text,
	`last_error` text,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_states` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
