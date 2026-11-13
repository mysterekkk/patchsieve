-- cleanup
ALTER TABLE users DROP COLUMN legacy_code;
ALTER TABLE users ADD COLUMN plan text NOT NULL;
DROP TABLE audit_log;
