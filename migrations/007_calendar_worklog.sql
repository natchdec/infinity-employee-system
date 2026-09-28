CREATE TABLE calendar_sync_states (
  employee_id uuid PRIMARY KEY REFERENCES employees(id),
  provider text NOT NULL DEFAULT 'outlook' CHECK(provider='outlook'),
  delta_link text,
  window_start date,
  window_end date,
  last_success_at timestamptz,
  last_error_code text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worklog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  source_type text NOT NULL CHECK(source_type IN ('outlook','excel','manual')),
  external_event_id text NOT NULL,
  external_occurrence_id text NOT NULL DEFAULT '',
  source_change_key text NOT NULL,
  subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL CHECK(end_at > start_at),
  is_all_day boolean NOT NULL DEFAULT false,
  location_label text,
  intent text NOT NULL CHECK(intent IN ('ot','onsite','leave')),
  leave_type_id text,
  source_payload_hash char(64) NOT NULL,
  draft_payload jsonb NOT NULL CHECK(jsonb_typeof(draft_payload)='object'),
  state text NOT NULL DEFAULT 'suggested'
    CHECK(state IN ('suggested','confirmed','ignored','submitted','exception','cancelled')),
  exception_code text,
  source_changed_after_confirmation boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES employees(id),
  confirmed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, source_type, external_event_id, external_occurrence_id, intent),
  CHECK((confirmed_by IS NULL) = (confirmed_at IS NULL)),
  CHECK(intent='leave' OR leave_type_id IS NULL)
);
CREATE INDEX worklog_employee_month ON worklog_items(employee_id,start_at,state);
CREATE INDEX worklog_review_queue ON worklog_items(employee_id,state,updated_at);

CREATE TABLE worklog_request_links (
  worklog_item_id uuid NOT NULL REFERENCES worklog_items(id),
  request_id uuid NOT NULL REFERENCES requests(id),
  request_round integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(worklog_item_id,request_id),
  FOREIGN KEY(request_id,request_round) REFERENCES request_revisions(request_id,round)
);
CREATE UNIQUE INDEX worklog_one_submitted_request
  ON worklog_request_links(worklog_item_id,request_id);
