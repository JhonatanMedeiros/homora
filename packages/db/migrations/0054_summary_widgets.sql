-- Every block of the Summary is a page widget. Existing pages, and the first page of a new
-- installation, receive them so the Summary keeps showing everything it showed before. Widgets
-- already on a page are untouched. `position` only orders them after the existing ones.
INSERT INTO `page_widgets` (`page_id`, `type`, `name`, `config`, `version`, `connection_id`, `position`, `size`)
SELECT p.`id`, s.`type`, '', '{}', 1, NULL,
	(SELECT COALESCE(MAX(w.`position`), -1) + 1 FROM `page_widgets` w WHERE w.`page_id` = p.`id`) + s.`ordinal`,
	'normal'
FROM `pages` p
CROSS JOIN (
	SELECT 'summary-pinned' AS `type`, 0 AS `ordinal`
	UNION ALL SELECT 'summary-attention', 1
	UNION ALL SELECT 'summary-services', 2
	UNION ALL SELECT 'summary-hosts', 3
	UNION ALL SELECT 'summary-probes', 4
	UNION ALL SELECT 'summary-figures', 5
	UNION ALL SELECT 'summary-proposals', 6
	UNION ALL SELECT 'summary-status', 7
	UNION ALL SELECT 'summary-availability', 8
	UNION ALL SELECT 'summary-latency', 9
	UNION ALL SELECT 'summary-maintenance', 10
) s
ORDER BY p.`position`, p.`id`, s.`ordinal`;
