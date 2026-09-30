ALTER TABLE project_references
  ADD COLUMN po_number text,
  ADD COLUMN po_date date,
  ADD COLUMN po_create_date date;

CREATE INDEX project_reference_po_number
  ON project_references (upper(btrim(po_number)))
  WHERE po_number IS NOT NULL AND btrim(po_number) <> '';
