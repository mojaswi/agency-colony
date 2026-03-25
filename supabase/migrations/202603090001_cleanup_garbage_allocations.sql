-- Clean up garbage allocation rows created by the textContent fallback bug.
-- The bug saved concatenated select option text as a project name
-- (e.g. "Select clientAcres of IcealtMYour Agency...").
-- First delete allocations referencing garbage projects, then delete the projects.
DELETE FROM app.allocations
WHERE project_id IN (
  SELECT id FROM app.projects
  WHERE length(name) > 100
     OR name LIKE 'Select client%'
);

DELETE FROM app.projects
WHERE length(name) > 100
   OR name LIKE 'Select client%';
