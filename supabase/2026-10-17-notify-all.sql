-- NOTIFY-ALL: source fields on memberships, owner notice outbox (owner list only), owner notices for reschedules.
alter table public.membership_pending add column if not exists heard_from text, add column if not exists heard_from_other text, add column if not exists utm_source text;
alter table public.memberships add column if not exists heard_from text, add column if not exists heard_from_other text, add column if not exists utm_source text, add column if not exists first_amount_cents integer;
create table if not exists public.owner_outbox (id bigserial primary key, kind text not null, payload jsonb not null default '{}', created_at timestamptz not null default now(), sent_at timestamptz, error text);
alter table public.owner_outbox enable row level security; -- no policies: service role only
revoke all on public.owner_outbox from anon, authenticated;

-- 1-on-1 / own-group parent move -> owner notice (flushed by notify when my.html reports the move)
do $$ declare d text; begin
  d := pg_get_functiondef('public.parent_move(text,bigint,timestamptz)'::regprocedure);
  if d not like '%owner_resched%' then
    d := replace(d, '  return jsonb_build_object(''ok'', true, ''from'', v_old, ''to'', p_start);',
      '  insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''coach_notice'', jsonb_build_object(''type'', ''rescheduled'', ''owner_resched'', true, ''from'', v_old, ''to'', p_start, ''workout_type'', r.workout_type));
  return jsonb_build_object(''ok'', true, ''from'', v_old, ''to'', p_start);');
    execute d; end if;
  d := pg_get_functiondef('public.group_move(text,bigint)'::regprocedure);
  if d not like '%owner_resched%' then
    d := replace(d, '  insert into training.email_outbox(signup_id, kind, payload) values (m.signup_id, ''group_moved'', jsonb_build_object(''group_id'', g.id));',
      '  insert into training.email_outbox(signup_id, kind, payload) values (m.signup_id, ''group_moved'', jsonb_build_object(''group_id'', g.id));
  insert into training.email_outbox(signup_id, kind, payload) values (m.signup_id, ''coach_notice'', jsonb_build_object(''type'', ''group_moved_owner'', ''owner_resched'', true, ''group'', training.og_json(g.id, true) - ''roster''));');
    execute d; end if;
  d := pg_get_functiondef('public.membership_reschedule(text,bigint,timestamptz)'::regprocedure);
  if d not like '%owner_outbox%' then
    d := replace(d, '  update memberships set reschedules_used=reschedules_used+1, reschedules_lifetime=reschedules_lifetime+1 where id=m.id;',
      '  update memberships set reschedules_used=reschedules_used+1, reschedules_lifetime=reschedules_lifetime+1 where id=m.id;
  insert into public.owner_outbox(kind, payload) values (''membership_rescheduled'', jsonb_build_object(''membership_id'', m.id, ''from'', s.starts_at, ''to'', p_start));');
    execute d; end if;
end $$;

-- Back office Members tab: source fields
do $$ declare d text; begin
  d := pg_get_functiondef('public.coach_memberships(text,text)'::regprocedure);
  if d not like '%heard_from%' then
    d := replace(d, '''is_test'',is_test)', '''is_test'',is_test,''heard_from'',(select mm.heard_from from memberships mm where mm.id=membership_admin.id),''heard_from_other'',(select mm.heard_from_other from memberships mm where mm.id=membership_admin.id),''utm_source'',(select mm.utm_source from memberships mm where mm.id=membership_admin.id))');
    execute d; end if;
end $$;
