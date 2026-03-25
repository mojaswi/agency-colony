-- Auto-link contracted deals to matching active clients by name
-- This sets client_id on deals that match an active client name but weren't linked yet

UPDATE app.deals d
SET client_id = c.id
FROM app.clients c
WHERE d.stage = 'contracted'
  AND d.client_id IS NULL
  AND c.is_active = true
  AND lower(trim(d.deal_name)) = lower(trim(c.name));

-- Also try partial match: deal name starts with client name
UPDATE app.deals d
SET client_id = c.id
FROM app.clients c
WHERE d.stage = 'contracted'
  AND d.client_id IS NULL
  AND c.is_active = true
  AND lower(trim(d.deal_name)) LIKE lower(trim(c.name)) || '%';
