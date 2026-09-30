ALTER TABLE document_links
  ADD COLUMN expense_line integer;

ALTER TABLE document_links
  ADD CONSTRAINT document_links_expense_line_positive
  CHECK (expense_line IS NULL OR expense_line > 0);

ALTER TABLE document_links
  ADD CONSTRAINT document_links_expense_line_fk
  FOREIGN KEY (request_id, round, expense_line)
  REFERENCES expense_lines(request_id, round, line);

CREATE INDEX document_links_request_expense_line
  ON document_links(request_id, round, expense_line)
  WHERE expense_line IS NOT NULL;
