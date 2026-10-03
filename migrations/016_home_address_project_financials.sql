ALTER TABLE employees
  ADD COLUMN home_address text;

ALTER TABLE employees
  ADD CONSTRAINT employee_home_address_length
  CHECK (home_address IS NULL OR length(btrim(home_address)) BETWEEN 5 AND 500);

ALTER TABLE project_references
  ADD COLUMN revenue_satang bigint,
  ADD COLUMN sale_cost_satang bigint,
  ADD COLUMN engineer_cost_satang bigint,
  ADD COLUMN entertain_cost_satang bigint,
  ADD COLUMN hidden_cost_satang bigint,
  ADD COLUMN sale_commission_satang bigint,
  ADD COLUMN source_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE project_references
  ADD CONSTRAINT project_revenue_nonnegative
  CHECK (revenue_satang IS NULL OR revenue_satang >= 0),
  ADD CONSTRAINT project_sale_cost_nonnegative
  CHECK (sale_cost_satang IS NULL OR sale_cost_satang >= 0),
  ADD CONSTRAINT project_engineer_cost_nonnegative
  CHECK (engineer_cost_satang IS NULL OR engineer_cost_satang >= 0),
  ADD CONSTRAINT project_entertain_cost_nonnegative
  CHECK (entertain_cost_satang IS NULL OR entertain_cost_satang >= 0),
  ADD CONSTRAINT project_hidden_cost_nonnegative
  CHECK (hidden_cost_satang IS NULL OR hidden_cost_satang >= 0),
  ADD CONSTRAINT project_sale_commission_nonnegative
  CHECK (sale_commission_satang IS NULL OR sale_commission_satang >= 0);
