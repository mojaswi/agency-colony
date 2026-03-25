-- Add 'archived' to task_status enum so weekly cleanup can archive completed tasks
ALTER TYPE app.task_status ADD VALUE IF NOT EXISTS 'archived';
