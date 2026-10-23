-- The 20-document cap counted public.profile_documents from inside its own insert policy, which Postgres rejects
-- as infinite recursion. Count through a security definer helper instead.
create function private.document_count(p_owner uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.profile_documents d where d.owner_id = p_owner;
$$;
revoke all on function private.document_count(uuid) from public, anon, authenticated;
grant execute on function private.document_count(uuid) to authenticated;

drop policy "Owners add up to 20 documents" on public.profile_documents;
create policy "Owners add up to 20 documents" on public.profile_documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and not private.is_demo_user((select auth.uid()))
              and private.document_count((select auth.uid())) < 20);
