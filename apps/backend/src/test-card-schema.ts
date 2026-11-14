/**
 * The two tables behind a dashboard card, for tests that build a small schema by hand: `monitors`
 * (what is monitored), `services` (the card), the two read views the code reads, and a trigger so a
 * fixture can still insert a whole card with one `INSERT INTO service_cards`.
 */
export const CARD_SCHEMA = `
CREATE TABLE monitors(id INTEGER PRIMARY KEY,name TEXT NOT NULL DEFAULT '',check_type TEXT NOT NULL DEFAULT 'http',check_interval INTEGER,expected_status TEXT,check_path TEXT,check_url TEXT,check_match TEXT,allow_private INTEGER NOT NULL DEFAULT 0,is_public INTEGER NOT NULL DEFAULT 0);
CREATE TABLE services(id INTEGER PRIMARY KEY REFERENCES monitors(id) ON DELETE CASCADE,url TEXT NOT NULL DEFAULT '',alias TEXT UNIQUE,category TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',icon TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,open_target TEXT NOT NULL DEFAULT 'new-tab',host_connection_id INTEGER,host_node TEXT,host_vmid INTEGER,host_type TEXT);
CREATE VIEW service_cards AS SELECT s.id AS id,m.name AS name,s.url AS url,s.alias AS alias,s.category AS category,s.description AS description,s.icon AS icon,s.position AS position,s.open_target AS open_target,m.allow_private AS allow_private,m.check_type AS check_type,m.check_interval AS check_interval,m.expected_status AS expected_status,m.check_path AS check_path,m.check_url AS check_url,m.check_match AS check_match,m.is_public AS is_public,s.host_connection_id AS host_connection_id,s.host_node AS host_node,s.host_vmid AS host_vmid,s.host_type AS host_type FROM services s JOIN monitors m ON m.id=s.id;
CREATE VIEW monitor_targets AS SELECT m.id AS id,m.name AS name,COALESCE(s.url,m.check_url) AS url,m.allow_private AS allow_private,m.check_type AS check_type,m.check_interval AS check_interval,m.expected_status AS expected_status,m.check_path AS check_path,m.check_url AS check_url,m.check_match AS check_match,m.is_public AS is_public FROM monitors m LEFT JOIN services s ON s.id=m.id;
CREATE TRIGGER service_cards_insert INSTEAD OF INSERT ON service_cards BEGIN
  INSERT INTO monitors(id,name,allow_private,check_type,check_interval,expected_status,check_path,check_url,check_match) VALUES(NEW.id,COALESCE(NEW.name,''),COALESCE(NEW.allow_private,0),COALESCE(NEW.check_type,'http'),NEW.check_interval,NEW.expected_status,NEW.check_path,NEW.check_url,NEW.check_match);
  INSERT INTO services(id,url,alias,category,description,icon,position,open_target,host_connection_id,host_node,host_vmid,host_type) VALUES((SELECT id FROM monitors WHERE rowid=last_insert_rowid()),COALESCE(NEW.url,''),NEW.alias,COALESCE(NEW.category,''),COALESCE(NEW.description,''),COALESCE(NEW.icon,''),COALESCE(NEW.position,0),COALESCE(NEW.open_target,'new-tab'),NEW.host_connection_id,NEW.host_node,NEW.host_vmid,NEW.host_type);
END;
`;
