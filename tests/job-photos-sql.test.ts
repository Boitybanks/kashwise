import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The migration's rules, checked as text alongside the full migration run in the SQL suites.
const sql = readFileSync('supabase/migrations/20261102000100_job_photos_and_open_to_work.sql', 'utf8')

describe('job photos migration', () => {
  it('only lets the poster add photos, from their own folder for that gig', () => {
    expect(sql).toMatch(/customer_id is distinct from \(select auth\.uid\(\)\)/)
    expect(sql).toMatch(/customer_id::text \|\| '\/gigs\/' \|\| p_gig::text/)
  })

  it('keeps writes behind the RPCs and off anonymous callers', () => {
    expect(sql).toMatch(/revoke all on function public\.add_gig_photo\(uuid, text\) from public, anon/)
    expect(sql).not.toMatch(/grant (update|insert).*public\.(gigs|portfolio_items)/)
  })

  it('carries photos to the record without touching confirm_completion', () => {
    expect(sql).toMatch(/before insert on public\.portfolio_items/)
    expect(sql).not.toMatch(/confirm_completion\(/)
  })

  it('hides people who are not open to work from the directory', () => {
    expect(sql).toMatch(/and p\.open_to_work/)
  })
})
