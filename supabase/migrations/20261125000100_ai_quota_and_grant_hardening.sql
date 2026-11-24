-- Zero-budget beta: persistent, atomic AI usage limits, plus removal of table write grants RLS never allows.
--
-- Every AI call is claimed first (public.claim_ai_call) and settled after (public.finish_ai_call). A claim checks,
-- in one transaction, the caller's daily limit for that feature, a global daily request and token budget, and a global
-- per-minute request and token budget, all kept below Groq's free-tier limits. If any check fails nothing is counted.
-- Days are South African days. The tables live in the private schema, which the API does not expose.

create table private.ai_user_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  feature text not null,
  used integer not null default 0,
  primary key (user_id, day, feature)
);

create table private.ai_budget (
  bucket text primary key,              -- 'day:2026-11-25' or 'min:2026-11-25T10:31'
  requests integer not null default 0,
  tokens integer not null default 0,
  expires_at timestamptz not null
);

create table private.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  est_tokens integer not null,
  used_tokens integer,
  day_bucket text not null,
  min_bucket text not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_calls_user_pending_idx on private.ai_calls (user_id, feature) where status = 'pending';
create index ai_calls_created_idx on private.ai_calls (created_at);

alter table private.ai_user_daily enable row level security;
alter table private.ai_budget enable row level security;
alter table private.ai_calls enable row level security;
revoke all on private.ai_user_daily, private.ai_budget, private.ai_calls from anon, authenticated;

-- Limits. Groq free tier for openai/gpt-oss-20b (checked 2026-11-25): 30 requests/min, 1,000/day, 8,000 tokens/min,
-- 200,000 tokens/day. KashWise stays well under each.
create or replace function private.ai_limit(p_name text) returns integer
language sql immutable set search_path = '' as $$
  select case p_name
    when 'dictation' then 3     -- per user per day
    when 'cv' then 1            -- per user per day
    when 'ask' then 5           -- per user per day (Ask iBanks, only if AI phrasing is switched on)
    when 'day_requests' then 400
    when 'day_tokens' then 150000
    when 'min_requests' then 20
    when 'min_tokens' then 6000
    else 0
  end
$$;

create or replace function public.claim_ai_call(p_feature text, p_est_tokens integer)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_local timestamp := now() at time zone 'Africa/Johannesburg';
  v_day date := v_local::date;
  v_day_bucket text := 'day:' || to_char(v_local, 'YYYY-MM-DD');
  v_min_bucket text := 'min:' || to_char(v_local, 'YYYY-MM-DD"T"HH24:MI');
  v_used integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to use AI.' using errcode = '42501'; end if;
  if p_feature not in ('dictation', 'cv', 'ask') then raise exception 'Unknown AI feature.' using errcode = '22023'; end if;
  if p_est_tokens is null or p_est_tokens < 1 or p_est_tokens > private.ai_limit('min_tokens') then
    raise exception 'AI request is too large.' using errcode = '22023';
  end if;

  -- A pending call from the last minute means a duplicate submission (double tap, two tabs).
  if exists (select 1 from private.ai_calls c where c.user_id = v_uid and c.feature = p_feature and c.status = 'pending' and c.created_at > v_now - interval '60 seconds') then
    return json_build_object('ok', false, 'reason', 'busy');
  end if;

  begin
    insert into private.ai_user_daily as u (user_id, day, feature, used) values (v_uid, v_day, p_feature, 1)
    on conflict (user_id, day, feature) do update set used = u.used + 1 where u.used < private.ai_limit(p_feature)
    returning u.used into v_used;
    if v_used is null then raise exception 'user_quota' using errcode = 'P0001'; end if;

    insert into private.ai_budget as b (bucket, requests, tokens, expires_at) values (v_day_bucket, 1, p_est_tokens, v_now + interval '2 days')
    on conflict (bucket) do update set requests = b.requests + 1, tokens = b.tokens + p_est_tokens
      where b.requests < private.ai_limit('day_requests') and b.tokens + p_est_tokens <= private.ai_limit('day_tokens');
    if not found then raise exception 'global_day' using errcode = 'P0001'; end if;

    insert into private.ai_budget as b (bucket, requests, tokens, expires_at) values (v_min_bucket, 1, p_est_tokens, v_now + interval '10 minutes')
    on conflict (bucket) do update set requests = b.requests + 1, tokens = b.tokens + p_est_tokens
      where b.requests < private.ai_limit('min_requests') and b.tokens + p_est_tokens <= private.ai_limit('min_tokens');
    if not found then raise exception 'global_minute' using errcode = 'P0001'; end if;
  exception when sqlstate 'P0001' then
    -- Everything in this block is rolled back, so a refused claim counts nowhere.
    return json_build_object('ok', false, 'reason', sqlerrm);
  end;

  insert into private.ai_calls (user_id, feature, est_tokens, day_bucket, min_bucket) values (v_uid, p_feature, p_est_tokens, v_day_bucket, v_min_bucket)
  returning id into v_id;

  -- Housekeeping: expired minute buckets and old call rows.
  delete from private.ai_budget where expires_at < v_now;
  delete from private.ai_calls where created_at < v_now - interval '30 days';

  return json_build_object('ok', true, 'call_id', v_id, 'remaining', private.ai_limit(p_feature) - v_used);
end;
$$;

-- Settles a claim: records real token use, and on a provider failure gives the person their daily use back
-- (the global request still counts, because the provider saw it).
create or replace function public.finish_ai_call(p_call uuid, p_ok boolean, p_used_tokens integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_call private.ai_calls;
  v_delta integer;
begin
  update private.ai_calls c set status = case when p_ok then 'ok' else 'failed' end,
    used_tokens = greatest(coalesce(p_used_tokens, c.est_tokens), 0), finished_at = now()
  where c.id = p_call and c.user_id = auth.uid() and c.status = 'pending'
  returning * into v_call;
  if not found then return; end if;

  v_delta := v_call.used_tokens - v_call.est_tokens;
  update private.ai_budget set tokens = greatest(tokens + v_delta, 0) where bucket in (v_call.day_bucket, v_call.min_bucket);
  if not p_ok then
    update private.ai_user_daily set used = greatest(used - 1, 0)
    where user_id = v_call.user_id and feature = v_call.feature and day = (v_call.created_at at time zone 'Africa/Johannesburg')::date;
  end if;
end;
$$;

-- What the person has left today, for the UI. Reads only the caller's own counts.
create or replace function public.my_ai_quota()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'dictation', private.ai_limit('dictation') - coalesce((select used from private.ai_user_daily where user_id = auth.uid() and feature = 'dictation' and day = (now() at time zone 'Africa/Johannesburg')::date), 0),
    'cv', private.ai_limit('cv') - coalesce((select used from private.ai_user_daily where user_id = auth.uid() and feature = 'cv' and day = (now() at time zone 'Africa/Johannesburg')::date), 0)
  )
$$;

revoke all on function public.claim_ai_call(text, integer), public.finish_ai_call(uuid, boolean, integer), public.my_ai_quota() from public, anon;
grant execute on function public.claim_ai_call(text, integer), public.finish_ai_call(uuid, boolean, integer), public.my_ai_quota() to authenticated;
revoke all on function private.ai_limit(text) from public, anon, authenticated;

-- Defence in depth: these tables are written only by security definer RPCs, and RLS has no write policy for them,
-- so the table grants were never usable. Remove them anyway.
revoke insert, update, delete on public.gig_handshakes, public.gig_work_ids, public.profile_identity from anon, authenticated;
revoke insert, update, delete on public.profile_documents from anon;
