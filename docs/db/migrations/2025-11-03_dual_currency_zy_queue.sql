-- Migration: Dual-currency points + Ziyun Pavilion queue
-- Decision: Migrate legacy total_score -> virtue_balance (Choice A)
-- DB: MySQL 8+

-- 1) user_points: add dual balances and unique constraint
ALTER TABLE user_points
  ADD COLUMN virtue_balance INT NOT NULL DEFAULT 0 AFTER user_id,
  ADD COLUMN contrib_balance INT NOT NULL DEFAULT 0 AFTER virtue_balance;

ALTER TABLE user_points
  ADD UNIQUE KEY uk_user_points_user (user_id);

-- Backfill: move old total_score into virtue_balance (Choice A)
UPDATE user_points SET virtue_balance = COALESCE(total_score, 0);

-- Optional (after verification) – drop legacy total_score
-- ALTER TABLE user_points DROP COLUMN total_score;


-- 2) points_ledger: add point_type and expand source_type enum; add helpful indexes
ALTER TABLE points_ledger
  ADD COLUMN IF NOT EXISTS point_type ENUM('VIRTUE','CONTRIB') NOT NULL DEFAULT 'VIRTUE' AFTER user_id,
  MODIFY COLUMN source_type ENUM(
    'DEED_REVIEW',
    'REDEEM','EXHIBIT_BUY',                    -- exhibit-related
    'ZIYUN_JOIN','ZIYUN_CANCEL','ZIYUN_LEAVE', -- legacy Ziyun values kept for compatibility
    'ZY_ENTRY','ZY_REFUND','ZY_EXIT',          -- new Ziyun values
    'ADMIN_ADJUST','ADJUST'                    -- keep old value for compatibility
  ) NOT NULL;

-- Indexes for common queries (ignore if your schema already has these)
CREATE INDEX idx_points_ledger_user_type_time ON points_ledger(user_id, point_type, created_at);
CREATE INDEX idx_points_ledger_source ON points_ledger(source_type, source_id);

-- Backfill existing rows' point_type using heuristics
UPDATE points_ledger SET point_type='CONTRIB'
WHERE source_type IN ('REDEEM','EXHIBIT_BUY');

UPDATE points_ledger SET point_type='VIRTUE'
WHERE source_type IN ('ZIYUN_JOIN','ZIYUN_CANCEL','ZIYUN_LEAVE','ZY_ENTRY','ZY_REFUND','ZY_EXIT');

UPDATE points_ledger pl
JOIN deed_submission ds ON pl.source_type='DEED_REVIEW' AND pl.source_id = ds.id
SET pl.point_type = ds.type;


-- 3) deed_submission: ensure type exists (VIRTUE/CONTRIB)
ALTER TABLE deed_submission
  ADD COLUMN IF NOT EXISTS type ENUM('VIRTUE','CONTRIB') NOT NULL DEFAULT 'VIRTUE' AFTER occurred_at;

-- 4) deed_review: add point_type (final confirmed currency) and score (if missing)
ALTER TABLE deed_review
  ADD COLUMN IF NOT EXISTS point_type ENUM('VIRTUE','CONTRIB') NOT NULL DEFAULT 'VIRTUE',
  ADD COLUMN IF NOT EXISTS score INT NULL;

-- Backfill review.point_type from submission.type and copy old score_delta
UPDATE deed_review dr
JOIN deed_submission ds ON dr.submission_id = ds.id
SET dr.point_type = ds.type;

UPDATE deed_review SET score = score_delta WHERE score IS NULL;


-- 5) Ziyun Pavilion queue table
CREATE TABLE IF NOT EXISTS zy_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  status ENUM('WAITING','INSIDE','LEFT') NOT NULL DEFAULT 'WAITING',
  joined_at DATETIME NOT NULL,
  entered_at DATETIME NULL,
  exited_at DATETIME NULL,
  cost_points INT NOT NULL DEFAULT 10,
  refunded BOOLEAN NOT NULL DEFAULT 0,
  remark VARCHAR(255),
  CONSTRAINT fk_zyq_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Unique active constraint + useful indexes
ALTER TABLE zy_queue
  ADD COLUMN active_user_key BIGINT GENERATED ALWAYS AS (
    CASE WHEN status IN ('WAITING','INSIDE') THEN user_id ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uk_zyq_active_user (active_user_key),
  ADD INDEX idx_zyq_status_joined (status, joined_at),
  ADD INDEX idx_zyq_user (user_id);


-- 6) Sanity queries (optional):
-- A) Verify balances present
-- SELECT user_id, virtue_balance, contrib_balance FROM user_points LIMIT 10;
-- B) Verify ledger point_type filled
-- SELECT id, user_id, point_type, source_type, delta FROM points_ledger ORDER BY id DESC LIMIT 20;
-- C) Verify zy_queue empty/ready
-- SELECT COUNT(*) FROM zy_queue;

