// KashWise for Android and iOS (Expo). Same Supabase backend, auth, RLS and iBanks engine as the web app.
// Payments are a labelled simulation; this app never moves money and holds no privileged keys.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import { earningsIntelligence } from '../src/lib/ibanks/analytics'
import { SCOPE_LABEL } from '../src/lib/ibanks/contracts'
import { savingsScenario } from '../src/lib/ibanks/savings'
import { categoryLabel } from '../src/lib/categories'
import { formatRand } from '../src/lib/money'
import { askIbanks, fetchMoney, fetchMyGigs, fetchOpenGigs, fetchProof, type MoneyRows, type OpenGig, type ProofRecord } from './src/data'
import { configured, DEMO, DEMO_PASSWORD, supabase } from './src/supabase'

const C = { brand: '#007b83', brandSoft: '#e8f8fa', ink: '#172b32', muted: '#607784', line: '#dce8ed', canvas: '#f8fcfd', sun: '#ffead6', sunInk: '#8c450c', clay: '#a33a1f' }

type Role = 'worker' | 'customer'
type Tab = 'work' | 'money' | 'proof' | 'gigs'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [roleOf, setRoleOf] = useState<{ uid: string; role: Role } | null>(null)
  const role = session && roleOf?.uid === session.user.id ? roleOf.role : null
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    supabase.from('profiles').select('role').eq('id', uid).maybeSingle().then(({ data }) => setRoleOf({ uid, role: (data?.role as Role) ?? 'worker' }))
  }, [session])

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      {!configured ? (
        <Centered><Text style={s.h2}>KashWise is not configured</Text><Text style={s.muted}>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.</Text></Centered>
      ) : !ready ? (
        <Centered><ActivityIndicator color={C.brand} /></Centered>
      ) : !session ? (
        <SignIn />
      ) : !role ? (
        <Centered><ActivityIndicator color={C.brand} /></Centered>
      ) : (
        <Home userId={session.user.id} role={role} email={session.user.email ?? ''} />
      )}
    </SafeAreaView>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={[s.pad, { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }]}>{children}</View>
}

function Btn({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, kind === 'secondary' && s.btnSecondary, (pressed || disabled) && { opacity: 0.7 }]}>
      <Text style={[s.btnText, kind === 'secondary' && { color: C.brand }]}>{label}</Text>
    </Pressable>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = async (e: string, p: string) => {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (err) setError('That email and password did not match.')
    setBusy(false)
  }
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 12, paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.logo}>Kash<Text style={{ color: C.brand }}>Wise</Text></Text>
      <Text style={s.tagline}>Earn it. Prove it. Grow it.</Text>
      <Text style={s.muted}>Find local paid work, build a verified record of every job, and understand your money with iBanks.</Text>
      <View style={s.card}>
        <Text style={s.label}>Email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" accessibilityLabel="Email" />
        <Text style={s.label}>Password</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" accessibilityLabel="Password" />
        {error && <Text style={{ color: C.clay }}>{error}</Text>}
        <Btn label={busy ? 'Signing in…' : 'Sign in'} onPress={() => signIn(email.trim(), password)} disabled={busy} />
      </View>
      <Text style={s.h3}>Try the demo (fictional sandbox accounts)</Text>
      <Btn kind="secondary" label={`Try as ${DEMO.worker.name} — worker`} onPress={() => signIn(DEMO.worker.email, DEMO_PASSWORD)} disabled={busy} />
      <Btn kind="secondary" label={`Try as ${DEMO.customer.name} — client`} onPress={() => signIn(DEMO.customer.email, DEMO_PASSWORD)} disabled={busy} />
      <Text style={s.small}>New accounts are created on the KashWise website, which also checks your SA ID number.</Text>
    </ScrollView>
  )
}

function Home({ userId, role, email }: { userId: string; role: Role; email: string }) {
  const tabs: { key: Tab; label: string }[] =
    role === 'worker'
      ? [{ key: 'money', label: 'Money' }, { key: 'work', label: 'Find work' }, { key: 'proof', label: 'ProofScript' }]
      : [{ key: 'gigs', label: 'My jobs' }, { key: 'work', label: 'Open jobs' }]
  const [tab, setTab] = useState<Tab>(tabs[0].key)
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.pad, s.header]}>
        <Text style={s.logoSmall}>Kash<Text style={{ color: C.brand }}>Wise</Text></Text>
        <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()}><Text style={s.link}>Sign out</Text></Pressable>
      </View>
      <Text style={[s.small, { paddingHorizontal: 16 }]}>Signed in as {email}</Text>
      <View style={{ flex: 1 }}>
        {tab === 'money' && <MoneyScreen userId={userId} />}
        {tab === 'work' && <OpenJobs />}
        {tab === 'proof' && <ProofScreen userId={userId} />}
        {tab === 'gigs' && <MyJobs userId={userId} />}
      </View>
      <View style={s.tabbar} accessibilityRole="tablist">
        {tabs.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={s.tab}>
            <Text style={[s.tabText, tab === t.key && { color: C.brand, fontWeight: '800' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** Generic load/refresh wrapper: loading, error with retry, pull-to-refresh. */
function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: Error) => alive && setState((p) => ({ ...p, error: e.message, loading: false })),
    )
    return () => {
      alive = false
    }
  }, [load, nonce])
  const reload = useCallback(() => {
    setState((p) => ({ ...p, loading: true }))
    setNonce((n) => n + 1)
  }, [])
  return { ...state, reload }
}

function Screen({ loading, error, reload, children }: { loading: boolean; error: string | null; reload: () => void; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 12, paddingBottom: 32 }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      {error ? (
        <View style={s.card}><Text style={{ color: C.clay }}>{error}</Text><Btn kind="secondary" label="Try again" onPress={reload} /></View>
      ) : children}
    </ScrollView>
  )
}

function SimulationNote() {
  return <Text style={s.sim}><Text style={{ fontWeight: '800' }}>Payment simulation.</Text> No real money moves, and no bank is connected.</Text>
}

function Tile({ label, cents, hint, badge = 'System-verified' }: { label: string; cents: number; hint: string; badge?: string }) {
  return (
    <View style={[s.card, { flexBasis: '47%', flexGrow: 1 }]} accessible accessibilityLabel={`${label}: ${formatRand(cents)}. ${hint}`}>
      <Text style={s.badge}>{badge}</Text>
      <Text style={s.label}>{label}</Text>
      <Text style={s.amount}>{formatRand(cents)}</Text>
      <Text style={s.small}>{hint}</Text>
    </View>
  )
}

function MoneyScreen({ userId }: { userId: string }) {
  const load = useCallback(() => fetchMoney(userId), [userId])
  const { data, error, loading, reload } = useLoad<MoneyRows>(load)
  const intel = useMemo(() => (data ? earningsIntelligence(data.entries, data.jobs, data.fetchedAt) : null), [data])
  return (
    <Screen loading={loading} error={error} reload={reload}>
      <Text style={s.h2}>KashWise Money</Text>
      <Text style={s.small}>Powered by iBanks · {SCOPE_LABEL}{intel ? ` · as of ${new Date(intel.as_of).toLocaleString('en-ZA')}` : ''}</Text>
      <SimulationNote />
      {data && !data.enabled && <View style={s.card}><Text>iBanks is not switched on for this database yet.</Text></View>}
      {data?.enabled && intel && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Tile label="Earned this week" cents={intel.this_week.net_earned_cents} hint={`${intel.this_week.settled_jobs} settled, after fees`} />
            <Tile label="Earned, not paid out" cents={intel.lifetime.available_cents} hint="Available to cash out" />
            <Tile label="Payout on its way" cents={intel.lifetime.payout_pending_cents} hint="Waiting for the provider" />
            <Tile label="Paid out to you" cents={intel.lifetime.paid_out_cents} hint="Confirmed by the provider" />
          </View>
          <Outlook intel={intel} />
          <Savings net={intel.lifetime.net_earned_cents} paidOut={intel.lifetime.paid_out_cents} />
          <Text style={s.h3}>iBanks insights</Text>
          {data.insights.length === 0 && <Text style={s.muted}>Insights appear when a payment settles or a payout changes.</Text>}
          {data.insights.map((i) => (
            <View key={i.id} style={s.card}>
              <Text style={s.h3}>{i.title}</Text>
              <Text>{i.body}</Text>
              <Text style={s.small}>{i.scope} · from {i.source_event_ids.length} verified event(s)</Text>
            </View>
          ))}
          <Ask />
        </>
      )}
    </Screen>
  )
}

function Outlook({ intel }: { intel: ReturnType<typeof earningsIntelligence> }) {
  const o = intel.outlook
  return (
    <View style={s.card}>
      <Text style={s.badge}>Estimated</Text>
      <Text style={s.h3}>Looking ahead</Text>
      {o.kind === 'insufficient_history' ? (
        <Text><Text style={{ fontWeight: '800' }}>Not enough data to forecast reliably.</Text> {o.complete_weeks} of {o.needed_weeks} complete weeks so far.</Text>
      ) : (
        <>
          <Text>Next 7 days: <Text style={{ fontWeight: '800' }}>{formatRand(o.next_7_days.low_cents)} – {formatRand(o.next_7_days.high_cents)}</Text></Text>
          <Text>Next 30 days: <Text style={{ fontWeight: '800' }}>{formatRand(o.next_30_days.low_cents)} – {formatRand(o.next_30_days.high_cents)}</Text></Text>
          <Text style={s.small}>
            Confidence {o.confidence}, from {o.basis_weeks} complete weeks.
            {o.backtest ? ` Off by ${formatRand(o.backtest.mean_abs_error_cents)} on average when tested on ${o.backtest.tests} past week(s).` : ''} An estimate, not a guarantee.
          </Text>
        </>
      )}
      {intel.patterns.suggestion.kind === 'focus_category' && (
        <Text style={[s.small, { marginTop: 6 }]}>
          {intel.patterns.suggestion.jobs} of {intel.patterns.suggestion.of_jobs} paid jobs were {categoryLabel(intel.patterns.suggestion.category).toLowerCase()} — a pattern in your history, not a promise.
        </Text>
      )}
    </View>
  )
}

function Savings({ net, paidOut }: { net: number; paidOut: number }) {
  const [bps, setBps] = useState(500)
  const sc = savingsScenario({ netCents: net, savingsBps: bps, retirementBps: 200, paidOutCents: paidOut })
  return (
    <View style={s.card}>
      <Text style={s.badge}>Simulated</Text>
      <Text style={s.h3}>Savings scenario</Text>
      <Text style={s.small}>Simulation only — no money is moved or deducted.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
        {[0, 500, 1000].map((v) => (
          <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: bps === v }} onPress={() => setBps(v)} style={[s.chip, bps === v && { backgroundColor: C.brand }]}>
            <Text style={{ color: bps === v ? '#fff' : C.ink, fontWeight: '700' }}>{v / 100}%</Text>
          </Pressable>
        ))}
      </View>
      <Text>Savings {formatRand(sc.savings_cents)} · Retirement (2%) {formatRand(sc.retirement_cents)} · Left {formatRand(sc.remainder_cents)}</Text>
      {sc.warnings.map((w) => <Text key={w} style={s.small}>{w}</Text>)}
    </View>
  )
}

function Ask() {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [meta, setMeta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ask = async (question: string) => {
    if (!question.trim()) return
    setBusy(true)
    setAnswer(null)
    try {
      const a = await askIbanks(question.trim())
      setAnswer(a.answer)
      setMeta(`${a.answered_by === 'ai' ? 'Phrased by AI · figures checked' : 'iBanks rules'} · ${a.limitations.join(' · ')}`)
    } catch (e) {
      setAnswer((e as Error).message)
      setMeta(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.h3}>Ask iBanks</Text>
      <Text style={s.small}>Answers come from your verified KashWise records. iBanks explains; it cannot move money.</Text>
      <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="How much did I make this week?" maxLength={500} accessibilityLabel="Your question" onSubmitEditing={() => ask(q)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {['How much did I make this week?', 'What if next week is slow?', 'Why is my payout pending?'].map((x) => (
          <Pressable key={x} onPress={() => { setQ(x); ask(x) }} style={s.chip} accessibilityRole="button"><Text style={s.small}>{x}</Text></Pressable>
        ))}
      </View>
      {busy && <ActivityIndicator color={C.brand} />}
      {answer && <Text style={{ marginTop: 8 }} accessibilityLiveRegion="polite">{answer}</Text>}
      {meta && <Text style={s.small}>{meta}</Text>}
    </View>
  )
}

function OpenJobs() {
  const { data, error, loading, reload } = useLoad<OpenGig[]>(fetchOpenGigs)
  return (
    <Screen loading={loading} error={error} reload={reload}>
      <Text style={s.h2}>Open jobs</Text>
      {data?.length === 0 && <Text style={s.muted}>No open jobs right now. Pull down to refresh.</Text>}
      {data?.map((g) => (
        <View key={g.id} style={s.card}>
          <Text style={s.h3}>{g.title}</Text>
          <Text style={s.muted}>{categoryLabel(g.category)} · {g.area_slug} · {g.scheduled_date}{g.is_demo ? ' · Demo' : ''}</Text>
          <Text>Worker receives <Text style={{ fontWeight: '800', color: C.brand }}>{formatRand(g.worker_net_cents)}</Text> after the 10% KashWise fee</Text>
        </View>
      ))}
      <Text style={s.small}>Apply on the KashWise website for now; applying in the app is next.</Text>
    </Screen>
  )
}

function ProofScreen({ userId }: { userId: string }) {
  const load = useCallback(() => fetchProof(userId), [userId])
  const { data, error, loading, reload } = useLoad<ProofRecord[]>(load)
  return (
    <Screen loading={loading} error={error} reload={reload}>
      <Text style={s.h2}>My ProofScript</Text>
      <Text style={s.muted}>Your skills. Your work. Your proof.</Text>
      <Text style={s.small}>Each record was created when the client confirmed the job — never typed in by the worker. "Verified" is not an ID or bank check.</Text>
      {data?.length === 0 && <Text style={s.muted}>Complete a job and the client's confirmation adds your first record.</Text>}
      {data?.map((r) => (
        <View key={r.id} style={s.card}>
          <Text style={s.h3}>{r.title}</Text>
          <Text style={s.muted}>{categoryLabel(r.category)} · {new Date(r.completed_at).toLocaleDateString('en-ZA')}{r.rating ? ` · ${r.rating}/5` : ''}</Text>
          <Text style={s.badge}>Client-confirmed</Text>
          {r.payment_confirmed && <Text style={s.badge}>Payment confirmed (simulated provider)</Text>}
          <Text style={s.small}>{r.record_code}</Text>
        </View>
      ))}
    </Screen>
  )
}

function MyJobs({ userId }: { userId: string }) {
  const load = useCallback(() => fetchMyGigs(userId), [userId])
  const { data, error, loading, reload } = useLoad(load)
  return (
    <Screen loading={loading} error={error} reload={reload}>
      <Text style={s.h2}>My jobs</Text>
      <SimulationNote />
      {data?.length === 0 && <Text style={s.muted}>You have not posted a job yet. Post one on the KashWise website.</Text>}
      {data?.map((g) => (
        <View key={g.id} style={s.card}>
          <Text style={s.h3}>{g.title}</Text>
          <Text style={s.muted}>{categoryLabel(g.category)} · {g.scheduled_date} · {g.status.replace('_', ' ')}{g.is_demo ? ' · Demo' : ''}</Text>
          <Text>You pay <Text style={{ fontWeight: '800' }}>{formatRand(g.payout_cents)}</Text>, nothing added</Text>
        </View>
      ))}
    </Screen>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  pad: { paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  logo: { fontSize: 40, fontWeight: '800', color: C.ink, letterSpacing: -1.5 },
  logoSmall: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -1 },
  tagline: { fontSize: 18, fontWeight: '700', color: C.brand },
  h2: { fontSize: 22, fontWeight: '800', color: C.ink },
  h3: { fontSize: 16, fontWeight: '800', color: C.ink },
  label: { fontSize: 13, fontWeight: '700', color: C.muted },
  amount: { fontSize: 24, fontWeight: '800', color: C.ink },
  muted: { color: C.muted },
  small: { fontSize: 12, color: C.muted },
  link: { color: C.brand, fontWeight: '700', padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 4, borderWidth: 1, borderColor: C.line },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff', marginBottom: 6 },
  btn: { minHeight: 48, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSecondary: { backgroundColor: C.brandSoft },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  badge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: C.brand, backgroundColor: C.brandSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  sim: { backgroundColor: C.sun, color: C.sunInk, padding: 10, borderRadius: 10, fontSize: 12 },
  chip: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff' },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, color: C.muted, fontWeight: '600' },
})
