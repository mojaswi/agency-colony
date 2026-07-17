-- Reset onboarding for all active employees so they re-verify profile + re-acknowledge policy
-- This is a one-time team-wide profile refresh (March 30, 2026)

-- 1. Reset onboarding_completed flag for all active employees
UPDATE app.employees
SET onboarding_completed = false,
    updated_at = now()
WHERE is_active = true;

-- 2. Delete existing remote working policy acknowledgments so everyone must re-acknowledge
DELETE FROM app.policy_acknowledgments
WHERE policy_key = 'remote_working_policy';
