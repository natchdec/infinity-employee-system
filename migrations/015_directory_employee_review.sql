ALTER TABLE microsoft_directory_accounts
  ADD COLUMN review_state text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed','employee','ignored')),
  ADD COLUMN reviewed_by uuid REFERENCES employees(id),
  ADD COLUMN reviewed_at timestamptz;

UPDATE microsoft_directory_accounts
SET review_state='employee',
    reviewed_at=coalesce(last_synced_at,now())
WHERE linked_employee_id IS NOT NULL;

CREATE INDEX microsoft_directory_review_state
  ON microsoft_directory_accounts(tenant_id,present,review_state,account_enabled,display_name);
