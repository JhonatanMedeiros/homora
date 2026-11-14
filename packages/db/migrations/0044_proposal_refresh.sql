DROP TRIGGER `service_proposal_immutable`;--> statement-breakpoint
CREATE TRIGGER `service_proposal_immutable` BEFORE UPDATE OF `author_id`, `diff`, `created_at`, `batch_id` ON `service_proposals` BEGIN SELECT RAISE(ABORT, 'proposal contents are immutable'); END;
