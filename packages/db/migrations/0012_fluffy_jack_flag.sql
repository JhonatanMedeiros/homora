ALTER TABLE `audit_events` ADD `detail` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `ip_address` text;--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);