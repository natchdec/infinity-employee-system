CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entra_object_id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(email)),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  department_id uuid REFERENCES departments(id),
  hire_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_head_owner boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entra_object_id), UNIQUE (email)
);
CREATE TABLE employee_roles (
  employee_id uuid NOT NULL REFERENCES employees(id),
  role text NOT NULL CHECK (role IN ('employee','head','finance','admin')),
  PRIMARY KEY (employee_id, role)
);
CREATE TABLE reporting_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  head_id uuid NOT NULL REFERENCES employees(id),
  effective_from date NOT NULL,
  effective_to date,
  CHECK (employee_id <> head_id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (employee_id, effective_from)
);
CREATE INDEX reporting_lines_lookup ON reporting_lines(employee_id, effective_from DESC);
CREATE TABLE wage_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  effective_from date NOT NULL,
  monthly_satang bigint NOT NULL CHECK (monthly_satang > 0),
  normal_daily_hours integer NOT NULL CHECK (normal_daily_hours BETWEEN 1 AND 8),
  ot_eligibility text NOT NULL CHECK (ot_eligibility IN ('eligible','ineligible','unknown')),
  created_by uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);
CREATE TABLE commute_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  effective_from date NOT NULL,
  distance_metres integer NOT NULL CHECK (distance_metres BETWEEN 0 AND 500000),
  verified_by uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);
CREATE TABLE policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family text NOT NULL CHECK (family IN ('calendar','leave','ot','mileage','per_diem','payroll','expense','approval')),
  version integer NOT NULL CHECK (version > 0),
  effective_from date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','published')),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  body_hash char(64) NOT NULL,
  legal_references jsonb NOT NULL DEFAULT '[]',
  revision integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (family, version),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE UNIQUE INDEX policy_published_boundary ON policy_versions(family, effective_from) WHERE status = 'published';
CREATE TABLE project_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('microsoft_lists','synthetic_uat')),
  source_tenant_id text NOT NULL,
  source_site_id text NOT NULL,
  source_list_id text NOT NULL,
  source_item_id text NOT NULL,
  code text NOT NULL, name text NOT NULL, customer text,
  sales_owner text, engineer_lead text, start_date date, end_date date,
  status text NOT NULL, cost_center text, source_etag text,
  last_synced_at timestamptz NOT NULL,
  UNIQUE (source_tenant_id, source_site_id, source_list_id, source_item_id)
);
CREATE INDEX project_reference_search ON project_references(code, status);
CREATE TABLE auth_flows (
  state_hash char(64) PRIMARY KEY,
  nonce text NOT NULL, verifier text NOT NULL,
  return_to text NOT NULL DEFAULT '/',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id),
  csrf_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX sessions_employee ON sessions(employee_id, expires_at);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES employees(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  revision integer,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_entity ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE TABLE command_receipts (
  actor_id uuid NOT NULL REFERENCES employees(id),
  scope text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 8 AND 160),
  input_hash char(64) NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, scope, key)
);
CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_history' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER wage_append_only BEFORE UPDATE OR DELETE ON wage_versions FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER commute_append_only BEFORE UPDATE OR DELETE ON commute_versions FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE FUNCTION protect_published_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN RAISE EXCEPTION 'published_policy_immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER policy_immutable BEFORE UPDATE OR DELETE ON policy_versions FOR EACH ROW EXECUTE FUNCTION protect_published_policy();
