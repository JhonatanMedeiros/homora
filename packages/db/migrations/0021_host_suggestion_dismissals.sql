CREATE TABLE `host_suggestion_dismissals` (
	`service_id` integer NOT NULL,
	`connection_id` integer NOT NULL,
	`node` text NOT NULL,
	`vmid` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`service_id`, `connection_id`, `vmid`, `type`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
