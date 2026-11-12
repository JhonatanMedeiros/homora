CREATE TABLE `service_dependencies` (
	`service_id` integer NOT NULL,
	`depends_on_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`service_id`, `depends_on_id`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "service_dependencies_no_self" CHECK("service_dependencies"."service_id" <> "service_dependencies"."depends_on_id")
);
--> statement-breakpoint
CREATE INDEX `service_dependencies_target_idx` ON `service_dependencies` (`depends_on_id`);