CREATE DATABASE IF NOT EXISTS atlascopco_drawing_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE atlascopco_drawing_db;

-- =========================
-- USERS TABLE
-- =========================
DROP TABLE IF EXISTS login_otp;
DROP TABLE IF EXISTS revision_error_codes;
DROP TABLE IF EXISTS drawing_files;
DROP TABLE IF EXISTS drawing_revisions;
DROP TABLE IF EXISTS error_codes;
DROP TABLE IF EXISTS drawings;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
    division VARCHAR(255),
    pc VARCHAR(50),
    team VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- DRAWINGS TABLE
-- =========================
CREATE TABLE drawings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    drawing_no VARCHAR(100) NOT NULL UNIQUE,
    creator_id BIGINT NOT NULL,
    task_number VARCHAR(100),
    drawing_type VARCHAR(255),
    submission_comments TEXT,
    status ENUM('submitted','under_review','approved','rejected')
        NOT NULL DEFAULT 'submitted',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_drawings_creator
        FOREIGN KEY (creator_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_drawings_creator ON drawings(creator_id);

-- =========================
-- DRAWING REVISIONS
-- =========================
CREATE TABLE drawing_revisions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    drawing_id BIGINT NOT NULL,
    revision_no INT NOT NULL,
    reviewer_id BIGINT,
    review_comments TEXT,
    reviewed_date DATETIME,
    approved BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_revision_drawing
        FOREIGN KEY (drawing_id)
        REFERENCES drawings(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_revision_reviewer
        FOREIGN KEY (reviewer_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT unique_revision_per_drawing
        UNIQUE (drawing_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_revision_drawing ON drawing_revisions(drawing_id);
CREATE INDEX idx_revision_reviewer ON drawing_revisions(reviewer_id);

-- =========================
-- DRAWING FILES
-- =========================
CREATE TABLE drawing_files (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    drawing_id BIGINT NOT NULL,
    revision_id BIGINT NULL,
    file_path VARCHAR(500) NOT NULL,
    uploaded_by BIGINT NOT NULL,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_files_drawing
        FOREIGN KEY (drawing_id)
        REFERENCES drawings(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_files_revision
        FOREIGN KEY (revision_id)
        REFERENCES drawing_revisions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_files_user
        FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_files_drawing ON drawing_files(drawing_id);
CREATE INDEX idx_files_revision ON drawing_files(revision_id);

-- =========================
-- ERROR CODES (MASTER)
-- =========================
CREATE TABLE error_codes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- REVISION ERROR CODES (JUNCTION)
-- =========================
CREATE TABLE revision_error_codes (
    revision_id BIGINT NOT NULL,
    error_code_id BIGINT NOT NULL,
    confidence_score FLOAT NULL,
    detected_by ENUM('AI','manual') NOT NULL DEFAULT 'manual',
    comment TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (revision_id, error_code_id),

    CONSTRAINT fk_rec_revision
        FOREIGN KEY (revision_id)
        REFERENCES drawing_revisions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_rec_error
        FOREIGN KEY (error_code_id)
        REFERENCES error_codes(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rec_error ON revision_error_codes(error_code_id);

-- =========================
-- LOGIN OTP
-- =========================
CREATE TABLE login_otp (
    user_id BIGINT NOT NULL,
    purpose ENUM('first_login','password_reset') NOT NULL,
    otp VARCHAR(100) NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (user_id, purpose),

    CONSTRAINT fk_otp_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;