ALTER TABLE `service_proposals` ADD `base_version` integer NOT NULL;--> statement-breakpoint
CREATE TRIGGER `service_proposal_immutable` BEFORE UPDATE OF `author_id`, `diff`, `base_hash`, `base_version`, `created_at` ON `service_proposals` BEGIN SELECT RAISE(ABORT, 'proposal contents are immutable'); END;
