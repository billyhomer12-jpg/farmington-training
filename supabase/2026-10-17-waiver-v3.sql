-- WAIVER-FIX (Billy, 10/17): Waiver v3 = v2 with the payment sentence covering single and free first sessions.
-- New version row; past signatures stay tied to v1/v2 (body_sha256). Idempotent. NOT yet applied.
insert into training.waiver_versions(version, title, body, active)
select '2026-10-v3', title, replace(body, 'Packages are 4 two-hour sessions, paid up front.', 'Every session is 2 hours. Packages (4 sessions) and single sessions are paid up front; the free first session for new players ages 12–18 needs no payment.'), false
from training.waiver_versions where version = '2026-10-v2' and position('Packages are 4 two-hour sessions, paid up front.' in body) > 0
on conflict (version) do nothing;
update training.waiver_versions set active = (version = '2026-10-v3') where exists (select 1 from training.waiver_versions where version = '2026-10-v3');
