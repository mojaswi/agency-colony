-- Fix leave policy allocations to match company policy:
-- PL: 8 days, CL: 8 days, SL: 12 days (was all 12)

update app.leave_cycle_policy
set pl_allocation = 8,
    cl_allocation = 8,
    sl_allocation = 12,
    updated_at = now()
where is_active = true;

-- Also update any existing employee leave cycles for the current cycle
update app.employee_leave_cycles
set pl_allocated = 8,
    cl_allocated = 8,
    sl_allocated = 12,
    updated_at = now()
where cycle_start = app.leave_cycle_start(current_date);
