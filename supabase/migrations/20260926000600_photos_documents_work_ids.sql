-- Profile photos, PDF documents and private Work IDs.
-- Demo accounts are shared by every judge, so none of them can upload or change anything here.

-- ── Profile photos ─────────────────────────────────────────────────────────
-- The browser crops to a square JPEG (which also strips EXIF/GPS) and uploads to avatars/<user id>/<uuid>.jpg.
alter table public.profiles add column avatar_path text
  constraint profiles_avatar_in_own_folder check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'));
grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Users upload their own profile photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.is_demo_user((select auth.uid())));
create policy "Users read their own profile photo objects" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy "Users delete their own profile photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

-- discover_workers gains avatar_path (appended so the ORDER BY ordinals are unchanged).
drop function public.discover_workers(text, text, integer, integer);
create function public.discover_workers(
  p_area text default null, p_skill text default null, p_limit integer default 20, p_offset integer default 0
) returns table (
  id uuid, display_name text, headline text, area_slug text, area_name text, skills text[], is_demo boolean,
  completed integer, avg_rating numeric, review_count integer, distance_km numeric, avatar_path text
)
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
    and (p_skill is null or p_skill = any (p.skills))
  order by 11 asc nulls last, 8 desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.discover_workers(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.discover_workers(text, text, integer, integer) to anon, authenticated;

-- ── PDF documents (qualifications, ID documents, other) ────────────────────
-- Self-uploaded and never checked by SideGigs. ID documents can never be made public.
create table public.profile_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('qualification', 'id_document', 'other')),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  storage_path text not null unique,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_documents_in_own_folder check (storage_path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.pdf$')),
  constraint profile_documents_id_stays_private check (kind <> 'id_document' or not is_public)
);
create index profile_documents_owner_idx on public.profile_documents (owner_id, created_at desc);
alter table public.profile_documents enable row level security;

create policy "Owners see their documents; anyone sees shared ones" on public.profile_documents for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()));
create policy "Owners add up to 20 documents" on public.profile_documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and not private.is_demo_user((select auth.uid()))
              and (select count(*) from public.profile_documents d where d.owner_id = (select auth.uid())) < 20);
create policy "Owners change document title and sharing" on public.profile_documents for update to authenticated
  using (owner_id = (select auth.uid()) and not private.is_demo_user((select auth.uid())))
  with check (owner_id = (select auth.uid()));
create policy "Owners delete their documents" on public.profile_documents for delete to authenticated
  using (owner_id = (select auth.uid()) and not private.is_demo_user((select auth.uid())));
grant select on public.profile_documents to anon, authenticated;
grant insert (kind, title, storage_path, size_bytes, is_public), update (title, is_public), delete on public.profile_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "Owners upload documents into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.is_demo_user((select auth.uid())));
create policy "Owners and viewers of shared documents read document files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'documents' and (
    owner_id = (select auth.uid())::text
    or exists (select 1 from public.profile_documents d where d.storage_path = objects.name and d.is_public)
  ));
create policy "Owners delete their document files" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and owner_id = (select auth.uid())::text);

-- ── Work IDs ───────────────────────────────────────────────────────────────
-- Issued the moment a customer accepts a worker. Only that customer and worker can read it, so quoting it in a
-- call or WhatsApp proves the other person really is their SideGigs match.
create table public.gig_work_ids (
  gig_id uuid primary key references public.gigs (id) on delete cascade,
  work_id text not null unique check (work_id ~ '^SG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  issued_at timestamptz not null default now()
);
alter table public.gig_work_ids enable row level security;
create policy "Only the customer and matched worker read the Work ID" on public.gig_work_ids for select to authenticated
  using (private.can_view_gig_private(gig_id));
grant select on public.gig_work_ids to authenticated;

-- 8 characters from a 32-letter alphabet without 0/O/1/I (40 random bits), e.g. SG-7KQ4-M2XP.
create function private.new_work_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  c text := '';
begin
  for i in 0..7 loop
    c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return 'SG-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
end $$;
revoke all on function private.new_work_id() from public, anon, authenticated;

create function private.issue_work_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'matched' and old.status = 'open' and new.assigned_worker_id is not null then
    loop
      begin
        insert into public.gig_work_ids (gig_id, work_id, worker_id)
        values (new.id, private.new_work_id(), new.assigned_worker_id)
        on conflict (gig_id) do nothing;
        exit;
      exception when unique_violation then
        -- work_id collision (1 in ~10^12): draw again
      end;
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.issue_work_id() from public, anon, authenticated;

create trigger gigs_issue_work_id after update of status on public.gigs
  for each row execute function private.issue_work_id();

-- Backfill gigs that were already matched before Work IDs existed.
insert into public.gig_work_ids (gig_id, work_id, worker_id, issued_at)
select g.id, private.new_work_id(), g.assigned_worker_id, coalesce(g.matched_at, now())
from public.gigs g
where g.status in ('matched', 'in_progress', 'completed') and g.assigned_worker_id is not null
on conflict do nothing;
