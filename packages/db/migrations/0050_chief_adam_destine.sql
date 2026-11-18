CREATE TABLE `service_identities` (
	`service_id` integer PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_identities_identity_unique` ON `service_identities` (`identity`);
--> statement-breakpoint
INSERT INTO service_identities(service_id, identity)
SELECT id, lower(hex(randomblob(16))) FROM services;
--> statement-breakpoint
CREATE TRIGGER service_identity_insert AFTER INSERT ON services BEGIN
  INSERT INTO service_identities(service_id, identity) VALUES (NEW.id, lower(hex(randomblob(16))));
END;
