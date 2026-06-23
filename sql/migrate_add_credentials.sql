USE backup_monitor_db;

ALTER TABLE instances
    ADD COLUMN db_username VARCHAR(100) NOT NULL DEFAULT 'root' AFTER port_number,
    ADD COLUMN db_password VARCHAR(255) NOT NULL DEFAULT ''     AFTER db_username;

UPDATE instances SET db_username = 'root', db_password = '' WHERE instance_name IN ('ICARD', 'ICARD-DR', 'CRM-DB');
