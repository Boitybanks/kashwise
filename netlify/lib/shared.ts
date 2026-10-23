// Shared helpers for the KashWise Netlify Functions (kept outside netlify/functions so it is not deployed as a function).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function env(name: string): string {
  const value = globalThis.Netlify?.env.get(name) ?? process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

/** For optional features (e.g. ANTHROPIC_API_KEY): undefined instead of an error when the variable is not set. */
export function optionalEnv(name: string): string | undefined {
  return globalThis.Netlify?.env.get(name) ?? process.env[name] ?? undefined
}

/** A Supabase client that acts AS THE CALLER (their JWT), so Postgres RLS makes every access decision. */
export function supabaseAs(jwt: string | null): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  })
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function seed(name: string): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from(env(name), 'base64'))
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`)
  return bytes
}

/** Never leak internals: unexpected failures become a generic JSON 500 (details go to function logs). */
export function safe(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req)
    } catch (e) {
      console.error('function error:', (e as Error).message)
      return json({ error: 'The secure service is temporarily unavailable. Please try again.' }, 500)
    }
  }
}
