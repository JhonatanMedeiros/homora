CREATE TABLE IF NOT EXISTS `weather_providers` (
	`provider` text PRIMARY KEY NOT NULL,
	`secret_ref` text NOT NULL,
	`updated_at` integer NOT NULL
);
