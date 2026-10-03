CREATE TABLE microsoft_directory_accounts (
  tenant_id uuid NOT NULL,
  entra_object_id uuid NOT NULL,
  user_principal_name text NOT NULL CHECK(user_principal_name=lower(user_principal_name)),
  email text CHECK(email IS NULL OR email=lower(email)),
  display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
  account_enabled boolean NOT NULL,
  user_type text NOT NULL DEFAULT '',
  job_title text,
  department_name text,
  office_location text,
  created_date_time timestamptz,
  linked_employee_id uuid REFERENCES employees(id),
  source_hash char(64) NOT NULL,
  present boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,entra_object_id),
  UNIQUE(tenant_id,user_principal_name)
);
CREATE INDEX microsoft_directory_linked_employee
  ON microsoft_directory_accounts(linked_employee_id)
  WHERE linked_employee_id IS NOT NULL;
CREATE INDEX microsoft_directory_review
  ON microsoft_directory_accounts(tenant_id,present,account_enabled,user_type,display_name);

CREATE TABLE microsoft_directory_sync_states (
  tenant_id uuid PRIMARY KEY,
  last_success_at timestamptz,
  last_error_code text,
  source_count integer NOT NULL DEFAULT 0 CHECK(source_count >= 0),
  linked_count integer NOT NULL DEFAULT 0 CHECK(linked_count >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
