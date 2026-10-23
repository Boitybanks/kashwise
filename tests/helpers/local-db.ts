// A local, in-process Postgres (PGlite) shaped like the Supabase project: anon/authenticated roles, auth.uid(),
// minimal auth/storage schemas and pgcrypto. Applies every migration in supabase/migrations in order.
// Lets SQL, RLS and RPC behaviour be tested without ever touching the live Supabase database.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
  email_change_token_current text, phone_change text, phone_change_token text, reauthentication_token text,
  is_sso_user boolean default false, is_anonymous boolean default false
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users (id) on delete cascade,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;

-- Supabase Vault (no grants to anon/authenticated, like the hosted one). Not encrypted locally: tests only.
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid
  language sql as $$ insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id $$;
`

export interface LocalDb {
  db: PGlite
  /** Run SQL as an authenticated user (RLS + grants apply), or as anon when uid is null. */
  as<T = Record<string, unknown>>(uid: string | null, sql: string, params?: unknown[]): Promise<T[]>
  /** Run SQL as the database owner (bypasses RLS): test setup and assertions only. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

export async function createLocalDb(opts: { only?: (file: string) => boolean } = {}): Promise<LocalDb> {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STUBS)
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (opts.only && !opts.only(f)) continue
    // pg_cron is a hosted-Supabase extension; its scheduled demo-refresh job is irrelevant to local tests.
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
      .replace(/create extension if not exists pg_cron;/i, 'create schema if not exists cron; create or replace function cron.schedule(text, text, text) returns bigint language sql as $f$ select 1::bigint $f$;')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`, { cause: e })
    }
  }

  const as = async <T>(uid: string | null, sql: string, params: unknown[] = []) => {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
      return (await tx.query<T>(sql, params)).rows
    })
  }
  const admin = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows
  return { db, as, admin }
}

/** Create a confirmed user + profile directly (setup only). */
export async function seedUser(l: LocalDb, opts: { id: string; name: string; role: 'worker' | 'customer'; demo?: boolean }) {
  await l.admin(`insert into auth.users (id, email, created_at) values ($1, $2, now())`, [opts.id, `${opts.id}@test.local`])
  await l.admin(`insert into public.profiles (id, display_name, role, area_slug, is_demo) values ($1, $2, $3, (select slug from public.areas limit 1), $4)`, [
    opts.id,
    opts.name,
    opts.role,
    opts.demo ?? false,
  ])
}
