-- Additive, repeatable migration for per-comment prediction feedback.
-- Existing drawings, revisions, error codes and revision_error_codes are untouched.
CREATE TABLE IF NOT EXISTS reviewer_error_feedback (
    id BIGINT NOT NULL AUTO_INCREMENT,
    revision_id BIGINT NOT NULL,
    comment_key CHAR(64) NOT NULL,
    comment_index INT NOT NULL,
    comment_text TEXT NOT NULL,
    classifier_prediction VARCHAR(50) NULL,
    ai_suggestion VARCHAR(50) NULL,
    final_code VARCHAR(50) NULL,
    review_decision VARCHAR(32) NOT NULL,
    prediction_method VARCHAR(64) NOT NULL,
    model_version VARCHAR(128) NULL,
    explanation TEXT NULL,
    reviewer_id BIGINT NULL,
    reviewed_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_feedback_revision_comment (revision_id, comment_key),
    KEY idx_feedback_final_code (final_code),
    CONSTRAINT fk_feedback_revision
        FOREIGN KEY (revision_id) REFERENCES drawing_revisions(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
