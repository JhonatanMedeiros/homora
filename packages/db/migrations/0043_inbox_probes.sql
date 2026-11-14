PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inbox_notifications` (
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
	FOREIGN KEY (`service_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`incident_id`) REFERENCES `service_incidents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_inbox_notifications`("id", "service_id", "incident_id", "kind", "service_name", "confirmed_at", "started_at", "ended_at", "reason", "http_status", "read_at") SELECT "id", "service_id", "incident_id", "kind", "service_name", "confirmed_at", "started_at", "ended_at", "reason", "http_status", "read_at" FROM `inbox_notifications`;--> statement-breakpoint
DROP TABLE `inbox_notifications`;--> statement-breakpoint
ALTER TABLE `__new_inbox_notifications` RENAME TO `inbox_notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_incident_kind_idx` ON `inbox_notifications` (`incident_id`,`kind`);--> statement-breakpoint
CREATE INDEX `inbox_confirmed_idx` ON `inbox_notifications` (`confirmed_at`,`id`);--> statement-breakpoint
CREATE INDEX `inbox_unread_idx` ON `inbox_notifications` (`read_at`);