-- Job photos and "open to work".
-- A client can show the job (the 75" TV, the flat-pack in its box). Those photos stay on the job and become the "before" of the
-- worker's record once it is confirmed; the worker's own evidence photos are the "after". Workers can switch off being open to work.
alter table public.gigs add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 6);
alter table public.portfolio_items add column before_paths text[] not null default '{}' check (cardinality(before_paths) <= 6);
alter table public.profiles add column open_to_work boolean not null default true;
grant update (open_to_work) on public.profiles to authenticated;

-- Photos live in the public work-evidence bucket, in the uploader's own folder, under gigs/<gig id>/.
create function public.add_gig_photo(p_gig uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_gig public.gigs;
begin
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if v_gig.id is null or v_gig.customer_id is distinct from (select auth.uid()) then
    raise exception 'Only the client who posted this gig can add photos.' using errcode = '42501';
  end if;
  if v_gig.status <> 'open' then
    raise exception 'Photos can be added while the gig is open.' using errcode = '23514';
  end if;
  if p_path not like (v_gig.customer_id::text || '/gigs/' || p_gig::text || '/%')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'work-evidence' and o.name = p_path) then
    raise exception 'That photo was not uploaded.' using errcode = '23514';
  end if;
  if p_path = any (v_gig.photo_paths) then return; end if;
  if cardinality(v_gig.photo_paths) >= 6 then
    raise exception 'You can add up to 6 photos.' using errcode = '23514';
  end if;
  update public.gigs g set photo_paths = array_append(g.photo_paths, p_path) where g.id = p_gig;
end;
$$;

create function public.remove_gig_photo(p_gig uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.gigs g set photo_paths = array_remove(g.photo_paths, p_path)
  where g.id = p_gig and g.customer_id = (select auth.uid()) and g.status = 'open';
end;
$$;

revoke all on function public.add_gig_photo(uuid, text) from public, anon;
revoke all on function public.remove_gig_photo(uuid, text) from public, anon;
grant execute on function public.add_gig_photo(uuid, text) to authenticated;
grant execute on function public.remove_gig_photo(uuid, text) to authenticated;

-- confirm_completion is the only writer of records; this copies the job's photos without changing it.
create function private.portfolio_before_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select g.photo_paths into new.before_paths from public.gigs g where g.id = new.gig_id;
  new.before_paths := coalesce(new.before_paths, '{}');
  return new;
end;
$$;
create trigger portfolio_before_photos before insert on public.portfolio_items
  for each row execute function private.portfolio_before_photos();

-- discover_gigs now returns the photos, so its row type changes.
drop function public.discover_gigs(text, text, text[], integer, integer);
create function public.discover_gigs(p_area text default null, p_category text default null, p_skills text[] default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, title text, category text, description text, area_slug text, area_name text, city text, scheduled_date date, time_window text, payout_cents integer, created_at timestamptz, is_demo boolean, customer_id uuid, customer_name text, customer_is_demo boolean, applicant_count integer, distance_km numeric, photo_paths text[])
language sql stable set search_path = '' as $$
  select g.id, g.title, g.category, g.description, g.area_slug, a.name, a.city,
         g.scheduled_date, g.time_window, g.payout_cents, g.created_at, g.is_demo,
         g.customer_id, p.display_name, p.is_demo, private.applicant_count(g.id),
         round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1),
         g.photo_paths
  from public.gigs g
  join public.areas a on a.slug = g.area_slug
  join public.profiles p on p.id = g.customer_id
  left join public.areas o on o.slug = p_area
  where g.status = 'open'
    and g.scheduled_date >= (now() at time zone 'Africa/Johannesburg')::date
    and (p_category is null or g.category = p_category)
    and (p_skills is null or cardinality(p_skills) = 0 or g.category = any (p_skills))
  order by 17 asc nulls last, g.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.discover_gigs(text, text, text[], integer, integer) to anon, authenticated;

-- The workers directory lists only people open to work.
create or replace function public.discover_workers(p_area text default null, p_skill text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, display_name text, headline text, area_slug text, area_name text, skills text[], is_demo boolean, completed integer, avg_rating numeric, review_count integer, distance_km numeric, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.headline, p.area_slug, a.name, p.skills, p.is_demo,
         (select count(*)::int from public.portfolio_items pi where pi.worker_id = p.id),
         (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = p.id),
         (select count(*)::int from public.reviews r where r.worker_id = p.id),
         round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1),
         p.avatar_path
  from public.profiles p
  join public.areas a on a.slug = p.area_slug
  left join public.areas o on o.slug = p_area
  where p.role = 'worker'
    and p.open_to_work
    and (p_skill is null or p_skill = any (p.skills))
  order by 11 asc nulls last, 8 desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
