CREATE INDEX IF NOT EXISTS `audit_events_proposal_action_idx` ON `audit_events` (`proposal_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `service_proposals_state_expires_idx` ON `service_proposals` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `service_proposals_batch_idx` ON `service_proposals` (`batch_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `service_proposals_author_idx` ON `service_proposals` (`author_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `service_proposals_created_idx` ON `service_proposals` (`created_at`);
