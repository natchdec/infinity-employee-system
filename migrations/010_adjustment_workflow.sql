ALTER TABLE adjustments
  ADD COLUMN assigned_head_id uuid REFERENCES employees(id),
  ADD COLUMN verified_by uuid REFERENCES employees(id),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN applied_by uuid REFERENCES employees(id),
  ADD COLUMN applied_at timestamptz;

CREATE INDEX adjustment_head_queue
  ON adjustments(assigned_head_id,state,created_at)
  WHERE state='pending_head';

CREATE INDEX adjustment_finance_queue
  ON adjustments(state,target_month,created_at)
  WHERE state IN ('finance_pending','verified');

ALTER TABLE adjustments
  ADD CONSTRAINT adjustment_verified_pair
    CHECK((verified_by IS NULL) = (verified_at IS NULL)),
  ADD CONSTRAINT adjustment_applied_pair
    CHECK((applied_by IS NULL) = (applied_at IS NULL)),
  ADD CONSTRAINT adjustment_verify_not_owner
    CHECK(verified_by IS NULL OR verified_by <> owner_id),
  ADD CONSTRAINT adjustment_apply_not_owner
    CHECK(applied_by IS NULL OR applied_by <> owner_id),
  ADD CONSTRAINT adjustment_state_evidence
    CHECK(
      (state NOT IN ('verified','applied') OR verified_by IS NOT NULL)
      AND (state <> 'applied' OR applied_by IS NOT NULL)
    );
