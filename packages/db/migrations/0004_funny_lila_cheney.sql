CREATE TABLE `agent_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_identities_token_hash_unique` ON `agent_identities` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`proposal_id` text,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `config_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`diff` text NOT NULL,
	`base_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewer` text
);
