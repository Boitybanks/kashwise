// Same Supabase project, auth and RLS as the web app. Publishable key only: no service-role key ever ships in an app.
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
/** Origin of the KashWise web deployment, for server functions such as Ask iBanks. */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? ''

export const configured = Boolean(url && key)

export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'not-configured', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
})

/** Fictional sandbox accounts, the same ones the web app's "Try as Thandi / Sipho" buttons use. */
export const DEMO = {
  worker: { email: 'demo.worker@sidegigs.app', name: 'Sipho' },
  customer: { email: 'demo.customer@sidegigs.app', name: 'Thandi' },
} as const
export const DEMO_PASSWORD = 'SideGigsDemo2026'
