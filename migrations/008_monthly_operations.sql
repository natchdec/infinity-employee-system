CREATE TABLE monthly_operational_periods (
  month char(7) NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  family text NOT NULL CHECK(family IN ('payroll','claims')),
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closing','locked')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  policy_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(policy_snapshot)='object'),
  changed_by uuid REFERENCES employees(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  PRIMARY KEY(month,family),
  CHECK((state='locked') = (locked_at IS NOT NULL))
);

CREATE TABLE approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES employees(id),
  delegate_id uuid NOT NULL REFERENCES employees(id),
  scope text NOT NULL DEFAULT 'manager_approval' CHECK(scope='manager_approval'),
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(delegator_id <> delegate_id),
  CHECK(effective_to >= effective_from)
);
CREATE INDEX approval_delegation_lookup
  ON approval_delegations(delegator_id,effective_from,effective_to)
  WHERE active;

CREATE TABLE adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES employees(id),
  source_type text NOT NULL CHECK(source_type IN ('request','payroll_item','obligation','settlement')),
  source_id uuid NOT NULL,
  source_round integer CHECK(source_round IS NULL OR source_round > 0),
  target_month char(7) NOT NULL CHECK(target_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 2000),
  delta jsonb NOT NULL CHECK(jsonb_typeof(delta)='object' AND delta <> '{}'::jsonb),
  state text NOT NULL DEFAULT 'draft'
    CHECK(state IN ('draft','pending_head','approved','finance_pending','verified','applied','void')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX adjustment_target_month ON adjustments(target_month,state);
CREATE INDEX adjustment_source ON adjustments(source_type,source_id);

CREATE FUNCTION protect_applied_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='applied' AND (
    TG_OP='DELETE' OR
    NEW.owner_id IS DISTINCT FROM OLD.owner_id OR
    NEW.source_type IS DISTINCT FROM OLD.source_type OR
    NEW.source_id IS DISTINCT FROM OLD.source_id OR
    NEW.source_round IS DISTINCT FROM OLD.source_round OR
    NEW.target_month IS DISTINCT FROM OLD.target_month OR
    NEW.reason IS DISTINCT FROM OLD.reason OR
    NEW.delta IS DISTINCT FROM OLD.delta OR
    NEW.state IS DISTINCT FROM OLD.state
  ) THEN
    RAISE EXCEPTION 'applied_adjustment_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER applied_adjustment_guard
  BEFORE UPDATE OR DELETE ON adjustments
  FOR EACH ROW EXECUTE FUNCTION protect_applied_adjustment();
