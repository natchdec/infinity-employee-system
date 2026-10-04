CREATE TABLE approval_route_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_key text NOT NULL CHECK (
    route_key IN (
      'leave',
      'ot',
      'expense_travel',
      'expense_other',
      'expense_mixed',
      'trip',
      'advance'
    )
  ),
  version integer NOT NULL CHECK (version > 0),
  effective_from date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('line_head','specific_employee')),
  approver_employee_id uuid REFERENCES employees(id),
  created_by uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (mode='line_head' AND approver_employee_id IS NULL)
    OR
    (mode='specific_employee' AND approver_employee_id IS NOT NULL)
  ),
  UNIQUE (route_key, version)
);

CREATE INDEX approval_route_effective
  ON approval_route_versions(route_key,effective_from DESC,version DESC);

CREATE TRIGGER approval_route_append_only
BEFORE UPDATE OR DELETE ON approval_route_versions
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

INSERT INTO approval_route_versions(route_key,version,effective_from,mode)
VALUES
  ('leave',1,'1970-01-01','line_head'),
  ('ot',1,'1970-01-01','line_head'),
  ('expense_travel',1,'1970-01-01','line_head'),
  ('expense_other',1,'1970-01-01','line_head'),
  ('expense_mixed',1,'1970-01-01','line_head'),
  ('trip',1,'1970-01-01','line_head'),
  ('advance',1,'1970-01-01','line_head');
