CREATE DATABASE IF NOT EXISTS backup_monitor_db;
USE backup_monitor_db;

CREATE TABLE IF NOT EXISTS users (
    user_id     INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,   
    full_name   VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS instances (
    instance_id     INT AUTO_INCREMENT PRIMARY KEY,
    instance_name   VARCHAR(100) NOT NULL,
    database_type   VARCHAR(50)  NOT NULL,      
    instance_ip     VARCHAR(50)  NOT NULL,
    port_number     INT          NOT NULL,
    status          VARCHAR(20)  DEFAULT 'Disconnected', 
    last_down_time  DATETIME     NULL,
    last_backup_date DATETIME    NULL,
    last_backup_location VARCHAR(255) NULL,
    last_backup_duration VARCHAR(50) NULL,
    last_backup_file_size VARCHAR(50) NULL,
    last_backup_remark   VARCHAR(500) NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_schedules (
    schedule_id     INT AUTO_INCREMENT PRIMARY KEY,
    instance_id     INT NOT NULL,
    backup_location VARCHAR(50)  NOT NULL,   
    backup_path     VARCHAR(255) NOT NULL,
    backup_datetime DATETIME     NOT NULL,
    status          VARCHAR(20)  DEFAULT 'Scheduled',  
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_schedule_instance FOREIGN KEY (instance_id)
    REFERENCES instances(instance_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_history (
    history_id      INT AUTO_INCREMENT PRIMARY KEY,
    instance_id     INT NOT NULL,
    backup_location VARCHAR(50)  NOT NULL,
    backup_path     VARCHAR(255) NOT NULL,
    backup_type     VARCHAR(20)  NOT NULL,  
    start_time      DATETIME NOT NULL,
    end_time        DATETIME NULL,
    duration        VARCHAR(50) NULL,
    file_size       VARCHAR(50) NULL,
    result_status   VARCHAR(20) DEFAULT 'Success', 
    remark          VARCHAR(500) NULL,
    CONSTRAINT fk_history_instance FOREIGN KEY (instance_id)
    REFERENCES instances(instance_id) ON DELETE CASCADE
);

INSERT INTO instances
(instance_name, database_type, instance_ip, port_number, status, last_down_time,
 last_backup_date, last_backup_location, last_backup_duration, last_backup_file_size, last_backup_remark)
VALUES
('ICARD', 'MySQL/Oracle', '10.180.18.2', 3600, 'Connected', '2025-05-25 10:30:00',
 '2026-05-25 10:30:00', 'd://databasebackup/25052025.dmp', '2 min 3 sec', '10MB',
 'Backup completed successfully.'),

('ICARD-DR', 'MySQL/Oracle', '10.180.18.3', 3600, 'Connected', '2025-05-20 09:15:00',
 '2026-05-24 22:00:00', 'd://databasebackup/24052025.dmp', '1 min 50 sec', '9.8MB',
 'Backup completed successfully.'),

('CRM-DB', 'Oracle', '10.180.20.5', 1521, 'Disconnected', '2026-06-01 03:00:00',
 '2026-05-30 02:00:00', 'd://databasebackup/30052026.dmp', '4 min 12 sec', '25MB',
 'Error occurred: connection timeout.');
