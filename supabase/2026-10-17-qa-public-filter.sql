-- QA-LEAK: never render test data publicly (names starting with 'QA', @example.com)
CREATE OR REPLACE FUNCTION public.approved_reviews()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('name', r.first_name || ' ' || upper(left(r.last_name,1)) || '.', 'body', r.body,
    'date', coalesce(r.approved_at, r.created_at)) order by coalesce(r.approved_at, r.created_at) desc), '[]')
  from (select * from training.reviews where status = 'approved'
          and btrim(first_name) !~* '^qa(\M|[-_ ])' and btrim(coalesce(last_name,'')) !~* '^qa(\M|[-_ ])'
          and (first_name||' '||coalesce(last_name,'')||' '||body) !~* '@example\.(com|org|net)'
        order by coalesce(approved_at, created_at) desc limit 200) r $function$;
