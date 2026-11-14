-- Keep the clickable card link separate from the monitor's optional check address.
DROP VIEW `monitor_targets`;
--> statement-breakpoint
CREATE VIEW `monitor_targets` AS
SELECT m.id AS id, m.name AS name, s.url AS link_url, m.allow_private AS allow_private,
 m.check_insecure AS check_insecure, m.check_type AS check_type, m.check_interval AS check_interval,
 m.expected_status AS expected_status, m.check_path AS check_path, m.check_url AS check_url,
 m.check_match AS check_match, m.is_public AS is_public
FROM `monitors` m LEFT JOIN `services` s ON s.id = m.id;
