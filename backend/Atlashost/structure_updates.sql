USE `atlascopco_drawing_db`;

CREATE TABLE IF NOT EXISTS `structure_divisions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL UNIQUE,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `structure_pcs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `division_id` INT NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`division_id`) REFERENCES `structure_divisions`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_pc_per_division` (`name`, `division_id`)
);

CREATE TABLE IF NOT EXISTS `structure_teams` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL UNIQUE,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Data from existing hardcoded values (EmployeeComponent)
INSERT IGNORE INTO `structure_divisions` (`name`) VALUES 
('AIA'), ('APE'), ('CTS'), ('IAS'), ('IAT'), ('OFA'), ('PFL'), ('VIN');

INSERT IGNORE INTO `structure_teams` (`name`) VALUES 
('CPI 1'), ('CPI 2'), ('CPI 3'), ('CPI 4'), ('TSG 1'), ('TSG 2'), ('TSG 3'), ('TSG 4'), ('AIA');

-- Seed PCs based on the map in EmployeeComponent
-- AIA
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'API', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'COX', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'FRJ', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UTY', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'TRD', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ITJ', id FROM `structure_divisions` WHERE name = 'AIA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNB', id FROM `structure_divisions` WHERE name = 'AIA';

-- APE
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'APE';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UVC', id FROM `structure_divisions` WHERE name = 'APE';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'APE';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'APE';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'APP', id FROM `structure_divisions` WHERE name = 'APE';

-- CTS
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'APC', id FROM `structure_divisions` WHERE name = 'CTS';

-- IAS
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'IAS';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ESF', id FROM `structure_divisions` WHERE name = 'IAS';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UVC', id FROM `structure_divisions` WHERE name = 'IAS';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'IAS';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'IAS';

-- IAT
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'API', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'COX', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'FRJ', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UTY', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'TRD', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ITJ', id FROM `structure_divisions` WHERE name = 'IAT';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ITR', id FROM `structure_divisions` WHERE name = 'IAT';

-- OFA
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'API', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'COX', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UTY', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'TRD', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ITJ', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNB', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'Crepelle', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UTF', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'APF', id FROM `structure_divisions` WHERE name = 'OFA';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'OFA STD', id FROM `structure_divisions` WHERE name = 'OFA';


-- PFL
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'PFL';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ESF', id FROM `structure_divisions` WHERE name = 'PFL';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UVC', id FROM `structure_divisions` WHERE name = 'PFL';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'PFL';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'PFL';


-- VIN
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'Edwards India (IPG)', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UWH', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'PNE', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'ESF', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'UVC', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'WUX', id FROM `structure_divisions` WHERE name = 'VIN';
INSERT IGNORE INTO `structure_pcs` (`name`, `division_id`) 
SELECT 'BQR', id FROM `structure_divisions` WHERE name = 'VIN';
