ALTER TABLE `services` ADD `host_connection_id` integer REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `services` ADD `host_node` text;--> statement-breakpoint
ALTER TABLE `services` ADD `host_vmid` integer;--> statement-breakpoint
ALTER TABLE `services` ADD `host_type` text;