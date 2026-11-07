CREATE TABLE `integration_instances` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`public_config` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`certificate_ref` text
);
--> statement-breakpoint
CREATE TABLE `integration_widgets` (
	`id` integer PRIMARY KEY NOT NULL,
	`integration_id` integer NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`public_config` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE restrict
);
