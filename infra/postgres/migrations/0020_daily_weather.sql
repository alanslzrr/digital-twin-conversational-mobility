ALTER TABLE weather_product DROP CONSTRAINT weather_product_resource_check;
ALTER TABLE weather_product ADD CONSTRAINT weather_product_resource_check
  CHECK (resource='warnings:28' OR resource ~ '^(forecast|daily):28[0-9]{3}$');
