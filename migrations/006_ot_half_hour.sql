ALTER TABLE ot_lines DROP CONSTRAINT IF EXISTS ot_lines_hours_check;
ALTER TABLE ot_lines
  ALTER COLUMN hours TYPE numeric(4,1) USING hours::numeric(4,1);
ALTER TABLE ot_lines
  ADD CONSTRAINT ot_lines_hours_check
  CHECK (
    hours BETWEEN 0.5 AND 24 AND hours * 2 = trunc(hours * 2)
  );
