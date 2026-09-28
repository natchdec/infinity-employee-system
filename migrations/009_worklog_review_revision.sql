ALTER TABLE worklog_items
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);

CREATE INDEX worklog_review_revision
  ON worklog_items(employee_id,id,revision);
