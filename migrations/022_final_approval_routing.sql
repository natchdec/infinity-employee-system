ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_workflow_state_check;

ALTER TABLE requests
  ADD CONSTRAINT requests_workflow_state_check
  CHECK (workflow_state IN (
    'draft','pending_head','pending_final','approved','returned','rejected','cancelled'
  ));

ALTER TABLE requests
  ADD COLUMN assigned_final_approver_id uuid REFERENCES employees(id),
  ADD COLUMN final_approval_state text NOT NULL DEFAULT 'not_required'
    CHECK (final_approval_state IN ('not_required','pending','approved','returned','rejected')),
  ADD COLUMN approval_route_key text,
  ADD COLUMN approval_route_version_id uuid REFERENCES approval_route_versions(id);

CREATE INDEX request_final_approval_queue
  ON requests(assigned_final_approver_id,final_approval_state,updated_at);

ALTER TABLE request_revisions
  ADD COLUMN assigned_final_approver_id uuid REFERENCES employees(id),
  ADD COLUMN approval_route_version_id uuid REFERENCES approval_route_versions(id);

ALTER TABLE approval_actions
  DROP CONSTRAINT IF EXISTS approval_actions_action_check;

ALTER TABLE approval_actions
  ADD CONSTRAINT approval_actions_action_check
  CHECK (action IN (
    'submitted','system_skipped','approved','returned','rejected','cancelled',
    'finance_verified','finance_returned',
    'final_approved','final_returned','final_rejected'
  ));

ALTER TABLE approval_route_versions
  DROP CONSTRAINT IF EXISTS approval_route_versions_mode_check;

ALTER TABLE approval_route_versions
  ADD CONSTRAINT approval_route_versions_mode_check
  CHECK (mode IN ('line_head','none','specific_employee','finance_payer'));

ALTER TABLE approval_route_versions
  DROP CONSTRAINT IF EXISTS approval_route_versions_check;

ALTER TABLE approval_route_versions
  ADD CONSTRAINT approval_route_versions_check
  CHECK (
    (mode IN ('line_head','none') AND approver_employee_id IS NULL)
    OR
    (mode IN ('specific_employee','finance_payer') AND approver_employee_id IS NOT NULL)
  );

ALTER TABLE approval_route_versions
  DROP CONSTRAINT IF EXISTS approval_route_versions_route_key_check;

ALTER TABLE approval_route_versions
  ADD CONSTRAINT approval_route_versions_route_key_check
  CHECK (route_key IN (
    'leave',
    'leave_annual',
    'leave_sick',
    'leave_other',
    'ot',
    'expense_travel',
    'expense_other',
    'expense_mixed',
    'trip',
    'advance'
  ));

INSERT INTO approval_route_versions(route_key,version,effective_from,mode)
VALUES
  ('leave_annual',1,'1970-01-01','none'),
  ('leave_sick',1,'1970-01-01','none'),
  ('leave_other',1,'1970-01-01','none')
ON CONFLICT(route_key,version) DO NOTHING;
