-- Remove ALL demo data before launch. Run once via the SQL editor / management API.
-- Covers: the original DEMO bookings (DEMO athletes, demo1-3@example.com) and the DEMO full open group
-- ('DEMO Tue/Thu 10 AM (full)' + its 4 DEMO sign-ups: Doe, Ruiz, Brown, Chen @example.com).
delete from training.email_outbox where signup_id in (select id from public.training_signups where is_demo or athlete like 'DEMO %');
delete from public.training_signups where is_demo or athlete like 'DEMO %';   -- cascades to requests, group members, waivers
delete from training.open_groups where is_demo or label like 'DEMO %';        -- cascades to group sessions
