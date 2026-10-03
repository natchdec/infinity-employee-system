CREATE TABLE payroll_cycles (
  month char(7) PRIMARY KEY CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  payday date NOT NULL, cutoff_at timestamptz NOT NULL,
  policy_snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','exported','closed')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES requests(id),
  round integer NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  cycle_month char(7) NOT NULL REFERENCES payroll_cycles(month),
  amount_satang bigint NOT NULL CHECK(amount_satang > 0),
  state text NOT NULL CHECK(state IN ('queued','exported','void')),
  approved_at timestamptz NOT NULL,
  FOREIGN KEY(request_id,round) REFERENCES request_revisions(request_id,round)
);
CREATE INDEX payroll_cycle_items ON payroll_items(cycle_month,state);
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES requests(id),
  owner_id uuid NOT NULL REFERENCES employees(id),
  revision integer NOT NULL DEFAULT 1,
  state text NOT NULL CHECK(state IN ('submitted','refund_due','top_up_due','settled','returned','void')),
  actual_satang bigint NOT NULL CHECK(actual_satang >= 0),
  paid_advance_satang bigint NOT NULL CHECK(paid_advance_satang >= 0),
  net_satang bigint NOT NULL,
  input_snapshot jsonb NOT NULL,
  due_date date NOT NULL,
  verified_by uuid REFERENCES employees(id), verified_at timestamptz,
  refund_reference text, refund_document_id uuid REFERENCES documents(id),
  refund_confirmed_by uuid REFERENCES employees(id), refund_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(net_satang = actual_satang - paid_advance_satang),
  CHECK(verified_by IS NULL OR verified_by <> owner_id),
  CHECK(refund_confirmed_by IS NULL OR refund_confirmed_by <> owner_id)
);
CREATE UNIQUE INDEX one_active_settlement ON settlements(trip_id) WHERE state NOT IN ('returned','void');
CREATE TABLE settlement_allocations (
  settlement_id uuid NOT NULL REFERENCES settlements(id),
  request_id uuid NOT NULL REFERENCES requests(id),
  round integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('actual','advance','per_diem')),
  amount_satang bigint NOT NULL CHECK(amount_satang >= 0),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(settlement_id,request_id,kind),
  FOREIGN KEY(request_id,round) REFERENCES request_revisions(request_id,round)
);
CREATE UNIQUE INDEX settlement_source_once ON settlement_allocations(request_id,kind) WHERE active;
CREATE TABLE payable_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES employees(id),
  source_kind text NOT NULL CHECK(source_kind IN ('expense','advance','settlement')),
  source_id uuid NOT NULL, source_round integer NOT NULL,
  request_id uuid REFERENCES requests(id),
  amount_satang bigint NOT NULL CHECK(amount_satang > 0),
  currency char(3) NOT NULL CHECK(currency='THB'),
  verified_by uuid NOT NULL REFERENCES employees(id),
  state text NOT NULL CHECK(state IN ('unpaid','allocated','paid','void')),
  snapshot jsonb NOT NULL,
  paid_at timestamptz,
  UNIQUE(source_kind,source_id,source_round),
  CHECK(verified_by <> owner_id)
);
CREATE TABLE payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  method text NOT NULL CHECK(method IN ('petty_cash','transfer')),
  status text NOT NULL CHECK(status IN ('draft','ready','paid','void')),
  total_satang bigint NOT NULL CHECK(total_satang > 0),
  revision integer NOT NULL DEFAULT 1,
  prepared_by uuid NOT NULL REFERENCES employees(id),
  paid_by uuid REFERENCES employees(id), paid_at timestamptz, paid_date date,
  external_reference text, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status='paid') = (paid_by IS NOT NULL AND paid_at IS NOT NULL AND paid_date IS NOT NULL AND external_reference IS NOT NULL))
);
CREATE TABLE payment_items (
  batch_id uuid NOT NULL REFERENCES payment_batches(id),
  obligation_id uuid NOT NULL REFERENCES payable_obligations(id),
  amount_satang bigint NOT NULL CHECK(amount_satang > 0),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(batch_id,obligation_id)
);
CREATE UNIQUE INDEX obligation_active_batch_once ON payment_items(obligation_id) WHERE active;
CREATE TABLE export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES employees(id),
  adapter text NOT NULL CHECK(adapter IN ('neutral_review_csv','easy_acc','smartbiz')),
  scope text NOT NULL, input_hash char(64) NOT NULL, input_snapshot jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('completed','blocked','failed')),
  artifact_key text, artifact_sha256 char(64), artifact_content text,
  blocked_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(adapter,scope,input_hash)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL, dedupe_key text NOT NULL UNIQUE, payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text, locked_until timestamptz, result jsonb, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_claim ON jobs(state,available_at);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  event_key text NOT NULL UNIQUE, kind text NOT NULL,
  title text NOT NULL, href text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE runtime_heartbeats (
  worker_id text PRIMARY KEY, last_seen_at timestamptz NOT NULL,
  state text NOT NULL, details jsonb NOT NULL DEFAULT '{}'
);
CREATE FUNCTION protect_paid_obligation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='paid' THEN RAISE EXCEPTION 'paid_obligation_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER obligation_paid_guard BEFORE UPDATE OR DELETE ON payable_obligations FOR EACH ROW EXECUTE FUNCTION protect_paid_obligation();
CREATE FUNCTION protect_payment_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='paid' THEN RAISE EXCEPTION 'paid_batch_immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status='paid' AND EXISTS (SELECT 1 FROM payment_items i JOIN payable_obligations o ON o.id=i.obligation_id WHERE i.batch_id=NEW.id AND i.active AND o.owner_id=NEW.paid_by) THEN
    RAISE EXCEPTION 'finance_self_payment_forbidden' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_batch_guard BEFORE UPDATE OR DELETE ON payment_batches FOR EACH ROW EXECUTE FUNCTION protect_payment_batch();
CREATE FUNCTION protect_paid_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_state='paid' AND (TG_OP='DELETE' OR NEW.draft_payload IS DISTINCT FROM OLD.draft_payload OR NEW.total_satang<>OLD.total_satang OR NEW.employee_id<>OLD.employee_id OR NEW.submission_round<>OLD.submission_round OR NEW.workflow_state<>OLD.workflow_state OR NEW.payment_state<>OLD.payment_state) THEN
    RAISE EXCEPTION 'paid_request_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paid_request_guard BEFORE UPDATE OR DELETE ON requests FOR EACH ROW EXECUTE FUNCTION protect_paid_request();
CREATE TRIGGER export_immutable BEFORE UPDATE OR DELETE ON export_jobs FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
