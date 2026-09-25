CREATE TABLE employee_external_ids (
  employee_id uuid NOT NULL REFERENCES employees(id),
  system text NOT NULL CHECK(system IN ('easy_acc')),
  external_id text NOT NULL CHECK(length(external_id) BETWEEN 1 AND 40),
  verified_at timestamptz,
  verified_by uuid REFERENCES employees(id),
  PRIMARY KEY(employee_id, system),
  UNIQUE(system, external_id)
);

CREATE TABLE route_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  provider text NOT NULL CHECK(provider='google_routes'),
  origin_kind text NOT NULL CHECK(origin_kind IN ('home','office','customer','other')),
  destination_kind text NOT NULL CHECK(destination_kind IN ('home','office','customer','other')),
  origin_label text NOT NULL CHECK(length(origin_label) BETWEEN 1 AND 200),
  destination_label text NOT NULL CHECK(length(destination_label) BETWEEN 1 AND 200),
  distance_metres integer NOT NULL CHECK(distance_metres BETWEEN 1 AND 3000000),
  duration_seconds integer CHECK(duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 604800),
  provider_response_hash char(64) NOT NULL,
  retention_confirmed boolean NOT NULL CHECK(retention_confirmed),
  expires_at timestamptz NOT NULL,
  consumed_by_request_id uuid REFERENCES requests(id),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at),
  CHECK((consumed_by_request_id IS NULL) = (consumed_at IS NULL))
);
CREATE INDEX route_quotes_owner_lookup ON route_quotes(employee_id, expires_at DESC);

CREATE FUNCTION protect_consumed_route_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'consumed_route_quote_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER route_quote_consumed_guard
BEFORE UPDATE OR DELETE ON route_quotes
FOR EACH ROW EXECUTE FUNCTION protect_consumed_route_quote();
