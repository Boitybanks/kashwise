-- Customers can discover capable people nearby: public profile fields + reputation aggregates only.
create function public.discover_workers(
  p_area text default null, p_skill text default null, p_limit integer default 20, p_offset integer default 0
) returns table (
  id uuid, display_name text, headline text, area_slug text, area_name text, skills text[], is_demo boolean,
  completed integer, avg_rating numeric, review_count integer, distance_km numeric
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.headline, p.area_slug, a.name, p.skills, p.is_demo,
         (select count(*)::int from public.portfolio_items pi where pi.worker_id = p.id),
         (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = p.id),
         (select count(*)::int from public.reviews r where r.worker_id = p.id),
         round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1)
  from public.profiles p
  join public.areas a on a.slug = p.area_slug
  left join public.areas o on o.slug = p_area
  where p.role = 'worker'
    and (p_skill is null or p_skill = any (p.skills))
  order by 11 asc nulls last, 8 desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.discover_workers(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.discover_workers(text, text, integer, integer) to anon, authenticated;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_skills_gin on public.profiles using gin (skills);
