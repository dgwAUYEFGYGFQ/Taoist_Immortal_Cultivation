-- Keep user_points in sync with points_ledger and reconcile current data
-- MySQL 8+

-- 1) Trigger: after inserting a ledger row, set the corresponding balance on user_points
DELIMITER $$
DROP TRIGGER IF EXISTS trg_points_ledger_ai $$
CREATE TRIGGER trg_points_ledger_ai
AFTER INSERT ON points_ledger
FOR EACH ROW
BEGIN
  -- Ensure a user_points row exists
  INSERT INTO user_points (user_id, virtue_balance, contrib_balance, updated_at)
  VALUES (NEW.user_id, 0, 0, NOW())
  ON DUPLICATE KEY UPDATE updated_at = NOW();

  -- Rebase the corresponding balance to the ledger's balance_after
  IF NEW.point_type = 'VIRTUE' THEN
    UPDATE user_points SET virtue_balance = NEW.balance_after, updated_at = NOW()
    WHERE user_id = NEW.user_id;
  ELSEIF NEW.point_type = 'CONTRIB' THEN
    UPDATE user_points SET contrib_balance = NEW.balance_after, updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
END $$
DELIMITER ;

-- 2) One-time reconcile: ensure rows exist and balances match latest ledger balance_after per currency
-- 2.1 Ensure every user present in ledger has a user_points row
INSERT INTO user_points (user_id, virtue_balance, contrib_balance, updated_at)
SELECT pl.user_id, 0, 0, NOW()
FROM (SELECT DISTINCT user_id FROM points_ledger) pl
LEFT JOIN user_points up ON up.user_id = pl.user_id
WHERE up.user_id IS NULL;

-- 2.2 Reconcile balances from latest ledger per currency type
UPDATE user_points up
LEFT JOIN (
  SELECT t.user_id, t.balance_after
  FROM (
    SELECT pl.user_id, pl.balance_after,
           ROW_NUMBER() OVER (PARTITION BY pl.user_id ORDER BY pl.id DESC) AS rn
    FROM points_ledger pl
    WHERE pl.point_type = 'VIRTUE'
  ) t
  WHERE t.rn = 1
) v ON v.user_id = up.user_id
LEFT JOIN (
  SELECT t.user_id, t.balance_after
  FROM (
    SELECT pl.user_id, pl.balance_after,
           ROW_NUMBER() OVER (PARTITION BY pl.user_id ORDER BY pl.id DESC) AS rn
    FROM points_ledger pl
    WHERE pl.point_type = 'CONTRIB'
  ) t
  WHERE t.rn = 1
) c ON c.user_id = up.user_id
SET up.virtue_balance = COALESCE(v.balance_after, up.virtue_balance),
    up.contrib_balance = COALESCE(c.balance_after, up.contrib_balance),
    up.updated_at = NOW();

