import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Publishable key only. The service-role key is never used by KashWise (architecture §4).
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const EVIDENCE_BUCKET = 'work-evidence'
export const AVATAR_BUCKET = 'avatars'
export const DOCUMENT_BUCKET = 'documents'

export function evidenceUrl(path: string): string {
  return supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path).data.publicUrl
}

export function avatarUrl(path: string | null | undefined): string | null {
  return path ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null
}
