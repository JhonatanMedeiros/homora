CREATE TABLE `inbox_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer,
	`incident_id` integer,
	`kind` text NOT NULL,
	`service_name` text NOT NULL,
	`confirmed_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`reason` text,
	`http_status` integer,
	`read_at` integer,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`incident_id`) REFERENCES `service_incidents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_incident_kind_idx` ON `inbox_notifications` (`incident_id`,`kind`);--> statement-breakpoint
CREATE INDEX `inbox_confirmed_idx` ON `inbox_notifications` (`confirmed_at`,`id`);--> statement-breakpoint
CREATE INDEX `inbox_unread_idx` ON `inbox_notifications` (`read_at`);