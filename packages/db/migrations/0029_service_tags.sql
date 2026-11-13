CREATE TABLE `service_tags` (
	`service_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`service_id`, `tag`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
