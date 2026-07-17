-- Tidy-up: the 7 live contracted clients with NULL termination_type are active.
-- termination_type is only meaningfully set when an engagement ENDS (Good/Bad).
-- Backfilling 'Active' makes the field consistent (the UI already treats them
-- as active via clients.is_active, so this is cosmetic correctness).
UPDATE app.deals SET termination_type = 'Active'
  WHERE stage = 'contracted' AND termination_type IS NULL;
