-- Splits the dashboard card from what is monitored, so a monitor can exist without a card (a probe).
--
-- The old `services` table becomes `monitors` (same ids, so every monitoring foreign key follows the
-- rename), and a new `services` table holds only the card. Tables that belong to the card (links,
-- pins, tags, resource links, widgets, dismissed suggestions) are rebuilt to point at the new table.
-- Runs with foreign keys off (see `migrate`), which makes the rebuilds cascade-free; the migrator
-- checks foreign keys again before it commits.
DROP INDEX `services_alias_unique`;
--> statement-breakpoint
ALTER TABLE `services` RENAME TO `monitors`;
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`alias` text,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`open_target` text DEFAULT 'new-tab' NOT NULL,
	`host_connection_id` integer,
	`host_node` text,
	`host_vmid` integer,
	`host_type` text,
	FOREIGN KEY (`id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_connection_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `services` (`id`, `url`, `alias`, `category`, `description`, `icon`, `position`, `open_target`, `host_connection_id`, `host_node`, `host_vmid`, `host_type`)
SELECT `id`, `url`, `alias`, `category`, `description`, `icon`, `position`, `open_target`, `host_connection_id`, `host_node`, `host_vmid`, `host_type` FROM `monitors`;
--> statement-breakpoint
CREATE UNIQUE INDEX `services_alias_unique` ON `services` (`alias`);
--> statement-breakpoint
CREATE TABLE `monitors_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`check_type` text DEFAULT 'http' NOT NULL,
	`check_interval` integer,
	`expected_status` text,
	`check_path` text,
	`check_url` text,
	`check_match` text,
	`allow_private` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `monitors_new` (`id`, `name`, `check_type`, `check_interval`, `expected_status`, `check_path`, `check_url`, `check_match`, `allow_private`, `is_public`)
SELECT `id`, `name`, `check_type`, `check_interval`, `expected_status`, `check_path`, `check_url`, `check_match`, `allow_private`, `is_public` FROM `monitors`;
--> statement-breakpoint
DROP TABLE `monitors`;
--> statement-breakpoint
ALTER TABLE `monitors_new` RENAME TO `monitors`;
--> statement-breakpoint
CREATE TABLE `service_links_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`service_id` integer NOT NULL,
	`type_id` integer,
	`name` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`open_target` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `link_types`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `service_links_new` SELECT `id`, `service_id`, `type_id`, `name`, `url`, `open_target`, `position` FROM `service_links`;
--> statement-breakpoint
DROP TABLE `service_links`;
--> statement-breakpoint
ALTER TABLE `service_links_new` RENAME TO `service_links`;
--> statement-breakpoint
CREATE INDEX `service_links_service_idx` ON `service_links` (`service_id`,`position`);
--> statement-breakpoint
CREATE TABLE `service_pins_new` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`pinned_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `service_pins_new` SELECT `service_id`, `pinned_at` FROM `service_pins`;
--> statement-breakpoint
DROP TABLE `service_pins`;
--> statement-breakpoint
ALTER TABLE `service_pins_new` RENAME TO `service_pins`;
--> statement-breakpoint
CREATE TABLE `service_tags_new` (
	`service_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`service_id`, `tag`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `service_tags_new` SELECT `service_id`, `tag` FROM `service_tags`;
--> statement-breakpoint
DROP TABLE `service_tags`;
--> statement-breakpoint
ALTER TABLE `service_tags_new` RENAME TO `service_tags`;
--> statement-breakpoint
CREATE TABLE `integration_resource_links_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`service_id` integer NOT NULL,
	`integration_id` integer NOT NULL,
	`resource_uuid` text NOT NULL,
	`resource_type` text NOT NULL,
	`seen_name` text NOT NULL,
	`seen_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `integration_resource_links_new` SELECT `id`, `service_id`, `integration_id`, `resource_uuid`, `resource_type`, `seen_name`, `seen_url`, `created_at` FROM `integration_resource_links`;
--> statement-breakpoint
DROP TABLE `integration_resource_links`;
--> statement-breakpoint
ALTER TABLE `integration_resource_links_new` RENAME TO `integration_resource_links`;
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_resource_links_service_idx` ON `integration_resource_links` (`service_id`);
--> statement-breakpoint
CREATE INDEX `integration_resource_links_resource_idx` ON `integration_resource_links` (`integration_id`,`resource_uuid`);
--> statement-breakpoint
CREATE TABLE `integration_widgets_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`integration_id` integer NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`public_config` text DEFAULT '{}' NOT NULL,
	`service_id` integer,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `integration_widgets_new` SELECT `id`, `integration_id`, `type`, `name`, `public_config`, `service_id` FROM `integration_widgets`;
--> statement-breakpoint
DROP TABLE `integration_widgets`;
--> statement-breakpoint
ALTER TABLE `integration_widgets_new` RENAME TO `integration_widgets`;
--> statement-breakpoint
CREATE TABLE `host_suggestion_dismissals_new` (
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
--> statement-breakpoint
INSERT INTO `host_suggestion_dismissals_new` SELECT `service_id`, `connection_id`, `node`, `vmid`, `type`, `created_at` FROM `host_suggestion_dismissals`;
--> statement-breakpoint
DROP TABLE `host_suggestion_dismissals`;
--> statement-breakpoint
ALTER TABLE `host_suggestion_dismissals_new` RENAME TO `host_suggestion_dismissals`;
--> statement-breakpoint
-- Read models. `service_cards` is the card with its monitor, in the shape `services` used to have.
-- `monitor_targets` is what the monitoring engine reads: a card's address is its own URL unless the
-- monitor sets `check_url`; a probe has no card, so its address is `check_url`.
CREATE VIEW `service_cards` AS
SELECT s.id AS id, m.name AS name, s.url AS url, s.alias AS alias, s.category AS category,
	s.description AS description, s.icon AS icon, s.position AS position, s.open_target AS open_target,
	m.allow_private AS allow_private, m.check_type AS check_type, m.check_interval AS check_interval,
	m.expected_status AS expected_status, m.check_path AS check_path, m.check_url AS check_url,
	m.check_match AS check_match, m.is_public AS is_public,
	s.host_connection_id AS host_connection_id, s.host_node AS host_node, s.host_vmid AS host_vmid,
	s.host_type AS host_type
FROM `services` s JOIN `monitors` m ON m.id = s.id;
--> statement-breakpoint
CREATE VIEW `monitor_targets` AS
SELECT m.id AS id, m.name AS name, COALESCE(s.url, m.check_url) AS url, m.allow_private AS allow_private,
	m.check_type AS check_type, m.check_interval AS check_interval, m.expected_status AS expected_status,
	m.check_path AS check_path, m.check_url AS check_url, m.check_match AS check_match,
	m.is_public AS is_public
FROM `monitors` m LEFT JOIN `services` s ON s.id = m.id;
