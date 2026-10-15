-- Coach notices to the business inbox: new paid open-group joins and under-minimum (Refund/move needed) groups.
alter table training.email_outbox drop constraint if exists email_outbox_kind_check;
alter table training.email_outbox add constraint email_outbox_kind_check check (kind in ('confirmation','rescheduled','waiver_copy','waiver_reminder','group_under_min','group_moved','coach_notice'));

do $$ declare d text; begin
  -- mark_paid: after the member is set paid, queue a coach notice for open-group joins
  d := pg_get_functiondef('public.training_mark_paid(uuid,text,integer)'::regprocedure);
  if d not like '%coach_notice%' then
    d := replace(d, '  insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''confirmation''',
      '  if s.package = ''open_group'' and m.id is not null and not s.is_demo then
    insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''coach_notice'', jsonb_build_object(''type'', ''join'', ''group'', training.og_json(m.group_id, true) - ''roster'',
      ''flag'', (select flag from training.open_group_members where id = m.id)));
  end if;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''confirmation''');
    execute d;
  end if;
  -- 48-hr check: one coach notice per under-minimum group (attached to its first paid member)
  d := pg_get_functiondef('training.open_group_check()'::regprocedure);
  if d not like '%coach_notice%' then
    d := replace(d, '      update training.open_groups set needs_action = true where id = g.id;',
      '      update training.open_groups set needs_action = true where id = g.id;
      insert into training.email_outbox(signup_id, kind, payload)
        select m.signup_id, ''coach_notice'', jsonb_build_object(''type'', ''under_min'', ''group'', training.og_json(g.id, true) - ''roster'')
        from training.open_group_members m where m.group_id = g.id and m.status = ''paid'' order by m.id limit 1;');
    execute d;
  end if;
  d := pg_get_functiondef('public.training_open_group_cron(text)'::regprocedure);
  d := replace(d, 'kind in (''group_under_min'',''group_moved'')', 'kind in (''group_under_min'',''group_moved'',''coach_notice'')');
  execute d;
end $$;
