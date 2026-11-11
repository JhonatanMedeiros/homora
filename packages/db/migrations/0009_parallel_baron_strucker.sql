CREATE TABLE `service_observations` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
