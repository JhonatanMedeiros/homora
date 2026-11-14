ALTER TABLE `monitors` ADD `check_insecure` integer DEFAULT false NOT NULL;
--> statement-breakpoint
DROP VIEW `service_cards`;
--> statement-breakpoint
DROP VIEW `monitor_targets`;
--> statement-breakpoint
CREATE VIEW `service_cards` AS
SELECT s.id AS id, m.name AS name, s.url AS url, s.alias AS alias, s.category AS category,
 s.description AS description, s.icon AS icon, s.position AS position, s.open_target AS open_target,
 m.allow_private AS allow_private, m.check_insecure AS check_insecure, m.check_type AS check_type,
 m.check_interval AS check_interval, m.expected_status AS expected_status, m.check_path AS check_path,
 m.check_url AS check_url, m.check_match AS check_match, m.is_public AS is_public,
 s.host_connection_id AS host_connection_id, s.host_node AS host_node, s.host_vmid AS host_vmid,
 s.host_type AS host_type
FROM `services` s JOIN `monitors` m ON m.id = s.id;
--> statement-breakpoint
CREATE VIEW `monitor_targets` AS
SELECT m.id AS id, m.name AS name, COALESCE(s.url, m.check_url) AS url, m.allow_private AS allow_private,
 m.check_insecure AS check_insecure, m.check_type AS check_type, m.check_interval AS check_interval,
 m.expected_status AS expected_status, m.check_path AS check_path, m.check_url AS check_url,
 m.check_match AS check_match, m.is_public AS is_public
FROM `monitors` m LEFT JOIN `services` s ON s.id = m.id;
