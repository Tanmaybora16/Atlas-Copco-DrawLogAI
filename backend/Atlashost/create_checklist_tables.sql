-- Table for storing CADQ checklist items
CREATE TABLE IF NOT EXISTS cadq_checklist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seq_nr VARCHAR(50) NOT NULL,
    standard_ref TEXT NOT NULL,
    part_val VARCHAR(10) DEFAULT '',
    piping_val VARCHAR(10) DEFAULT '',
    welded_val VARCHAR(10) DEFAULT '',
    other_val VARCHAR(10) DEFAULT '',
    ferro_val VARCHAR(10) DEFAULT '',
    non_ferro_val VARCHAR(10) DEFAULT '',
    casted_machined_val VARCHAR(10) DEFAULT '',
    machined_non_casted_val VARCHAR(10) DEFAULT '',
    sheet_metal_val VARCHAR(10) DEFAULT '',
    foam_decals_val VARCHAR(10) DEFAULT '',
    assembly_val VARCHAR(10) DEFAULT '',
    instruction_val VARCHAR(10) DEFAULT '',
    information_val VARCHAR(10) DEFAULT '',
    safety_labels_val VARCHAR(10) DEFAULT '',
    team_name VARCHAR(100) DEFAULT NULL,
    display_order INT NOT NULL
);

-- Table for storing global application settings
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
);

-- Insert default checklist edition if not exists
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('checklist_edition', '06');
