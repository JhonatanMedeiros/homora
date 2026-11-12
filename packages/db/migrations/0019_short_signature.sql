UPDATE `service_observation_history` SET `signature` = substr(`signature`, 1, 16) WHERE length(`signature`) > 16;--> statement-breakpoint
UPDATE `service_observations` SET `signature` = substr(`signature`, 1, 16) WHERE length(`signature`) > 16;--> statement-breakpoint
UPDATE `notification_states` SET `state` = json_set(`state`, '$.signature', substr(json_extract(`state`, '$.signature'), 1, 16)) WHERE length(json_extract(`state`, '$.signature')) > 16;--> statement-breakpoint
ANALYZE;
