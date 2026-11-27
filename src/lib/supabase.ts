import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://plzbbfoteevfpqxspyxi.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_G5HXYOR3EysCbSpAibCBtA_NPS3pxee'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && key)

// Publishable key only. The service-role key is never used by KashWise (architecture §4).
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const EVIDENCE_BUCKET = 'work-evidence'
export const AVATAR_BUCKET = 'avatars'
export const DOCUMENT_BUCKET = 'documents'

export function evidenceUrl(path: string): string {
  if (path.startsWith('/samples/')) return path // Sample gallery photos ship with the site.
  return supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path).data.publicUrl
}

export function avatarUrl(path: string | null | undefined): string | null {
  return path ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null
}
