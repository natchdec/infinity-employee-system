CREATE TABLE google_api_usage_monthly (
  month text NOT NULL,
  sku text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, sku),
  CONSTRAINT google_api_usage_month_shape CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  CONSTRAINT google_api_usage_sku CHECK (sku IN ('places_autocomplete','routes_compute')),
  CONSTRAINT google_api_usage_nonnegative CHECK (request_count >= 0)
);
