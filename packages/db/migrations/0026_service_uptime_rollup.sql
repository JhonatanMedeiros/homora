CREATE TABLE `service_uptime_rollup` (
	`service_id` integer NOT NULL,
	`hour` integer NOT NULL,
	`up` integer DEFAULT 0 NOT NULL,
	`down` integer DEFAULT 0 NOT NULL,
	`unknown` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`service_id`, `hour`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
