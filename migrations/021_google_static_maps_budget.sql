ALTER TABLE google_api_usage_monthly
  DROP CONSTRAINT IF EXISTS google_api_usage_sku;

ALTER TABLE google_api_usage_monthly
  ADD CONSTRAINT google_api_usage_sku
  CHECK (sku IN ('places_autocomplete','routes_compute','maps_static'));
