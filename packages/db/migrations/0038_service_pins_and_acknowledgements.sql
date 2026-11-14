CREATE TABLE `service_acknowledgements` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`incident_id` integer,
	`acknowledged_at` integer NOT NULL,
	`muted_until` integer,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `service_pins` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`pinned_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
