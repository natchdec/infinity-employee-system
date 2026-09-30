ALTER TABLE worklog_items
  DROP CONSTRAINT worklog_items_check;

ALTER TABLE worklog_items
  ADD CONSTRAINT worklog_items_time_order
  CHECK (end_at >= start_at);
