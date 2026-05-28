-- Fix health_score precision: NUMERIC(3,2) maxes at 9.99, need to store 100.00
ALTER TABLE model_endpoints
  ALTER COLUMN health_score TYPE NUMERIC(5, 2);

ALTER TABLE model_endpoints
  ALTER COLUMN health_score SET DEFAULT 100.00;
