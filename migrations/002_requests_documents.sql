CREATE SEQUENCE request_reference_seq;
CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('leave','ot','expense','trip','advance')),
  employee_id uuid NOT NULL REFERENCES employees(id),
  project_reference_id uuid REFERENCES project_references(id),
  parent_trip_id uuid REFERENCES requests(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  business_date date NOT NULL,
  draft_payload jsonb NOT NULL CHECK (jsonb_typeof(draft_payload) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  submission_round integer NOT NULL DEFAULT 0 CHECK (submission_round >= 0),
  workflow_state text NOT NULL DEFAULT 'draft' CHECK (workflow_state IN ('draft','pending_head','approved','returned','rejected','cancelled')),
  finance_state text NOT NULL DEFAULT 'not_required' CHECK (finance_state IN ('not_required','pending','verified','returned')),
  payment_state text NOT NULL DEFAULT 'not_applicable' CHECK (payment_state IN ('not_applicable','unpaid','allocated','paid')),
  total_satang bigint NOT NULL DEFAULT 0 CHECK (total_satang BETWEEN 0 AND 99999999999),
  currency char(3) NOT NULL DEFAULT 'THB' CHECK (currency='THB'),
  assigned_head_id uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_trip_id IS NULL OR parent_trip_id <> id)
);
CREATE INDEX request_employee_queue ON requests(employee_id, updated_at DESC);
CREATE INDEX request_head_queue ON requests(assigned_head_id, workflow_state, created_at);
CREATE INDEX request_finance_queue ON requests(kind, finance_state, payment_state, created_at);
CREATE INDEX request_trip_children ON requests(parent_trip_id, workflow_state);
CREATE TABLE request_revisions (
  request_id uuid NOT NULL REFERENCES requests(id),
  round integer NOT NULL CHECK (round > 0),
  payload jsonb NOT NULL,
  calculation jsonb NOT NULL,
  policy_snapshots jsonb NOT NULL,
  project_snapshot jsonb,
  wage_snapshot jsonb,
  assigned_head_id uuid REFERENCES employees(id),
  input_hash char(64) NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, round)
);
CREATE TABLE approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  round integer NOT NULL,
  actor_id uuid REFERENCES employees(id),
  action text NOT NULL CHECK (action IN ('submitted','system_skipped','approved','returned','rejected','cancelled','finance_verified','finance_returned')),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE INDEX approval_request_history ON approval_actions(request_id, occurred_at);
CREATE TABLE leave_bookings (
  request_id uuid NOT NULL,
  round integer NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  type_id text NOT NULL,
  period text NOT NULL,
  days integer NOT NULL CHECK(days > 0),
  paid_days integer NOT NULL CHECK(paid_days >= 0 AND paid_days <= days),
  state text NOT NULL CHECK(state IN ('held','approved','cancelled')),
  PRIMARY KEY(request_id, round),
  FOREIGN KEY (request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE UNIQUE INDEX leave_one_active_round ON leave_bookings(request_id) WHERE state IN ('held','approved');
CREATE INDEX leave_balance_lookup ON leave_bookings(employee_id, type_id, period, state);
CREATE TABLE leave_reservations (
  request_id uuid NOT NULL,
  round integer NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  leave_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(request_id, round, leave_date),
  FOREIGN KEY(request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE UNIQUE INDEX leave_no_active_overlap ON leave_reservations(employee_id, leave_date) WHERE active;
CREATE TABLE leave_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  type_id text NOT NULL, period text NOT NULL,
  units integer NOT NULL CHECK(units <> 0),
  request_id uuid REFERENCES requests(id), round integer,
  event_key text NOT NULL UNIQUE, reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ot_lines (
  request_id uuid NOT NULL, round integer NOT NULL, line integer NOT NULL,
  work_date date NOT NULL, category_id text NOT NULL,
  hours integer NOT NULL CHECK(hours BETWEEN 1 AND 24),
  multiplier_basis_points integer NOT NULL CHECK(multiplier_basis_points >= 10000),
  amount_satang bigint NOT NULL CHECK(amount_satang >= 0),
  PRIMARY KEY(request_id, round, line),
  UNIQUE(request_id, round, category_id),
  FOREIGN KEY(request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE INDEX ot_work_date ON ot_lines(work_date, request_id);
CREATE TABLE expense_lines (
  request_id uuid NOT NULL, round integer NOT NULL, line integer NOT NULL,
  category_id text NOT NULL, expense_date date NOT NULL,
  amount_satang bigint NOT NULL CHECK(amount_satang >= 0),
  description text NOT NULL, detail jsonb NOT NULL,
  PRIMARY KEY(request_id, round, line),
  FOREIGN KEY(request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE TABLE trip_details (
  request_id uuid NOT NULL, round integer NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL CHECK(end_date >= start_date),
  destination text NOT NULL, region text NOT NULL CHECK(region IN ('domestic','international')),
  per_diem_satang bigint NOT NULL CHECK(per_diem_satang >= 0),
  due_date date NOT NULL, detail jsonb NOT NULL,
  PRIMARY KEY(request_id, round),
  FOREIGN KEY(request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES employees(id),
  storage_key text NOT NULL UNIQUE,
  filename text NOT NULL, media_type text NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  sha256 char(64) NOT NULL,
  scan_state text NOT NULL CHECK(scan_state IN ('clean','quarantined','rejected')),
  evidence_class text NOT NULL CHECK(evidence_class IN ('expense','medical','settlement')),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_links (
  document_id uuid NOT NULL REFERENCES documents(id),
  request_id uuid NOT NULL, round integer NOT NULL,
  PRIMARY KEY(document_id, request_id, round),
  FOREIGN KEY(request_id, round) REFERENCES request_revisions(request_id, round)
);
CREATE TABLE original_receipts (
  request_id uuid PRIMARY KEY REFERENCES requests(id),
  state text NOT NULL CHECK(state IN ('not_required','outstanding','received')),
  received_by uuid REFERENCES employees(id), received_at timestamptz,
  note text, revision integer NOT NULL DEFAULT 1,
  CHECK((state='received') = (received_at IS NOT NULL))
);
CREATE TRIGGER request_round_append_only BEFORE UPDATE OR DELETE ON request_revisions FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER approval_append_only BEFORE UPDATE OR DELETE ON approval_actions FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER leave_ledger_append_only BEFORE UPDATE OR DELETE ON leave_ledger FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER ot_line_immutable BEFORE UPDATE OR DELETE ON ot_lines FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER expense_line_immutable BEFORE UPDATE OR DELETE ON expense_lines FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER trip_detail_immutable BEFORE UPDATE OR DELETE ON trip_details FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
