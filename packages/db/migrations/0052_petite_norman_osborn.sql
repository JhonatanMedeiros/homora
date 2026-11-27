CREATE TABLE `oidc_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text,
	`draft` text,
	`preferences` text NOT NULL
);
