# Atlas Copco DrawLogAI: Database ER Diagram

This document contains both the high-resolution visual database Entity-Relationship (ER) diagram chart and the Mermaid configuration code matching your production database schema (`atlascopco_drawing_db`).

---

## 1. Visual ER Diagram Chart

Below is the generated high-resolution ER diagram chart image. You can open and print this image directly for physical documentation:

![Database ER Diagram](file:///c:/Atlas-Copco-DrawLogAI/docs/database_er_diagram.png)

*The physical image is saved locally at: `c:\Atlas-Copco-DrawLogAI\docs\database_er_diagram.png`*

---

## 2. Relational Mermaid Configuration Code

In case you need to edit the schema relationships or re-generate the diagram textually, here is the raw code definition:

```mermaid
erDiagram
    users {
        bigint id PK "AUTO_INCREMENT"
        varchar_50 emp_id UK "NOT NULL"
        varchar_255 name "NOT NULL"
        varchar_255 email UK "NOT NULL"
        varchar_255 password_hash "NOT NULL"
        enum_admin_user role "NOT NULL DEFAULT 'user'"
        varchar_255 division "NULL"
        varchar_50 pc "NULL"
        varchar_100 team "NULL"
        tinyint_1 is_active "NOT NULL DEFAULT 1"
        datetime created_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
        datetime updated_at "NOT NULL ON UPDATE CURRENT_TIMESTAMP"
    }

    drawings {
        bigint id PK "AUTO_INCREMENT"
        varchar_100 drawing_no UK "NOT NULL"
        bigint creator_id FK "NOT NULL"
        varchar_100 task_number "NULL"
        varchar_255 drawing_type "NULL"
        text submission_comments "NULL"
        enum_status status "NOT NULL DEFAULT 'submitted'"
        varchar_50 pc "NULL"
        datetime created_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
        datetime updated_at "NOT NULL ON UPDATE CURRENT_TIMESTAMP"
    }

    drawing_revisions {
        bigint id PK "AUTO_INCREMENT"
        bigint drawing_id FK "NOT NULL"
        int revision_no "NOT NULL"
        bigint reviewer_id FK "NULL"
        text review_comments "NULL"
        datetime reviewed_date "NULL"
        tinyint_1 approved "DEFAULT 0"
        varchar_50 task_number "NULL"
        datetime created_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
        datetime updated_at "NOT NULL ON UPDATE CURRENT_TIMESTAMP"
    }

    drawing_files {
        bigint id PK "AUTO_INCREMENT"
        bigint drawing_id FK "NOT NULL"
        bigint revision_id FK "NULL"
        varchar_500 file_path "NULL"
        bigint uploaded_by FK "NOT NULL"
        datetime uploaded_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
        longblob file_data "NULL"
    }

    error_codes {
        bigint id PK "AUTO_INCREMENT"
        varchar_50 code UK "NOT NULL"
        text description "NULL"
        varchar_100 category "NULL"
        tinyint_1 is_active "NOT NULL DEFAULT 1"
        datetime created_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
    }

    revision_error_codes {
        bigint revision_id PK, FK "NOT NULL"
        bigint error_code_id PK, FK "NOT NULL"
        float confidence_score "NULL"
        enum_detected_by detected_by "NOT NULL DEFAULT 'manual'"
        text comment "NULL"
        datetime created_at "NOT NULL DEFAULT CURRENT_TIMESTAMP"
    }

    login_otp {
        bigint user_id PK, FK "NOT NULL"
        enum_otp_purpose purpose PK "NOT NULL"
        varchar_100 otp "NOT NULL"
        datetime expires_at "NOT NULL"
        tinyint_1 consumed "NOT NULL DEFAULT 0"
    }

    structure_divisions {
        int id PK "AUTO_INCREMENT"
        varchar_255 name UK "NOT NULL"
        tinyint_1 is_active "DEFAULT 1"
        datetime created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    structure_pcs {
        int id PK "AUTO_INCREMENT"
        varchar_255 name "NOT NULL"
        int division_id FK "NOT NULL"
        tinyint_1 is_active "DEFAULT 1"
        datetime created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    structure_teams {
        int id PK "AUTO_INCREMENT"
        varchar_255 name UK "NOT NULL"
        tinyint_1 is_active "DEFAULT 1"
        datetime created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    %% Relationship Rules
    users ||--o{ drawings : "creates (creator_id -> id)"
    users ||--o{ drawing_revisions : "reviews (reviewer_id -> id)"
    users ||--o{ drawing_files : "uploads (uploaded_by -> id)"
    users ||--o{ login_otp : "requests (user_id -> id)"
    
    drawings ||--|{ drawing_revisions : "versioned by (drawing_id -> id)"
    drawings ||--o{ drawing_files : "has files (drawing_id -> id)"
    
    drawing_revisions ||--o| drawing_files : "links source file (revision_id -> id)"
    drawing_revisions ||--o{ revision_error_codes : "associated (revision_id -> id)"
    
    error_codes ||--o{ revision_error_codes : "maps code (error_code_id -> id)"
    
    structure_divisions ||--o{ structure_pcs : "contains (division_id -> id)"
```
