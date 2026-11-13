CREATE TABLE `service_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`reason` text NOT NULL,
	`http_status` integer,
	`failed_checks` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_incidents_service_idx` ON `service_incidents` (`service_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `service_incidents_started_idx` ON `service_incidents` (`started_at`);--> statement-breakpoint
CREATE TABLE `service_monitor_settings` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`failure_threshold` integer DEFAULT 1 NOT NULL,
	`recovery_threshold` integer DEFAULT 1 NOT NULL,
	`degraded_latency_ms` integer,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
