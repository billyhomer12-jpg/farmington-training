-- Reviews: public submit (pending) -> coach approves in /admin -> shown on reviews.html
create table if not exists training.reviews (
  id bigint generated always as identity primary key,
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_name text not null check (char_length(last_name) between 1 and 40),
  body text not null check (char_length(body) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  ip_hash text, created_at timestamptz not null default now(), approved_at timestamptz
);
create index if not exists reviews_status_idx on training.reviews(status, created_at desc);
create index if not exists reviews_ip_idx on training.reviews(ip_hash, created_at);
alter table training.reviews enable row level security;  -- no policies: no direct access
revoke all on training.reviews from public, anon, authenticated;

create or replace function public.submit_review(p_first text, p_last text, p_body text, p_website text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f text := btrim(coalesce(p_first,'')); l text := btrim(coalesce(p_last,'')); b text := btrim(coalesce(p_body,''));
  ip text; h text;
begin
  if coalesce(p_website,'') <> '' then return jsonb_build_object('ok', true); end if; -- honeypot: silently drop
  if char_length(f) not between 1 and 40 or char_length(l) not between 1 and 40 then return jsonb_build_object('error','Please enter your first and last name (up to 40 characters each).'); end if;
  if char_length(b) not between 10 and 1500 then return jsonb_build_object('error','Reviews must be between 10 and 1,500 characters.'); end if;
  begin ip := coalesce(nullif((current_setting('request.headers', true)::jsonb)->>'cf-connecting-ip',''), split_part(coalesce((current_setting('request.headers', true)::jsonb)->>'x-forwarded-for',''), ',', 1)); exception when others then ip := ''; end;
  h := encode(extensions.digest(coalesce(nullif(btrim(ip),''),'unknown') || ':fc-reviews', 'sha256'), 'hex');
  if (select count(*) from training.reviews where ip_hash = h and created_at > now() - interval '10 minutes') >= 2
     or (select count(*) from training.reviews where created_at > now() - interval '1 minute') >= 5
     or (select count(*) from training.reviews where status = 'pending' and created_at > now() - interval '1 day') >= 100 then
    return jsonb_build_object('error','Too many reviews right now. Please try again in a few minutes.');
  end if;
  insert into training.reviews(first_name, last_name, body, ip_hash) values (f, l, b, h);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.approved_reviews() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', r.first_name || ' ' || upper(left(r.last_name,1)) || '.', 'body', r.body,
    'date', coalesce(r.approved_at, r.created_at)) order by coalesce(r.approved_at, r.created_at) desc), '[]')
  from (select * from training.reviews where status = 'approved' order by coalesce(approved_at, created_at) desc limit 200) r $$;

-- internal action (used by the PIN-checked coach RPC)
create or replace function training.review_action(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'delete' then delete from training.reviews where id = p_id;
  elsif p_action in ('approved','hidden','pending') then
    update training.reviews set status = p_action, approved_at = case when p_action = 'approved' then now() else approved_at end where id = p_id;
  else return jsonb_build_object('error','bad action'); end if;
  if not found then return jsonb_build_object('error','Review not found.'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.coach_reviews(p_email text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object('reviews', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'last_name',last_name,
    'body',body,'status',status,'created_at',created_at,'approved_at',approved_at) order by created_at desc), '[]') from training.reviews));
end $$;

create or replace function public.coach_review_action(p_email text, p_pin text, p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return training.review_action(p_id, p_action);
end $$;

revoke all on function training.review_action(bigint, text) from public, anon, authenticated;
revoke all on function public.submit_review(text,text,text,text), public.approved_reviews(), public.coach_reviews(text,text),
  public.coach_review_action(text,text,bigint,text) from public;
grant execute on function public.submit_review(text,text,text,text), public.approved_reviews(), public.coach_reviews(text,text),
  public.coach_review_action(text,text,bigint,text) to anon, authenticated;
