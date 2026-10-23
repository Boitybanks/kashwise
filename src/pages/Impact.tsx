import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Clock, HandCoins, Repeat, Star, Users } from 'lucide-react'
import { fetchImpact } from '../lib/api'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { percent } from '../lib/format'
import { formatRand } from '../lib/money'
import { Card, ErrorState, PageHeader, Skeleton } from '../components/ui'

export default function Impact() {
  const [includeDemo, setIncludeDemo] = useState(true)
  const q = useQuery({ queryKey: ['impact', includeDemo], queryFn: () => fetchImpact(includeDemo), refetchInterval: 30000 })
  const m = q.data

  const funnel = m
    ? [
        { label: 'Gigs posted', value: m.gigs_posted },
        { label: 'Matched with a worker', value: m.gigs_matched },
        { label: 'Completed & confirmed', value: m.gigs_completed },
      ]
    : []
  const max = Math.max(1, ...funnel.map((f) => f.value))

  return (
    <div>
      <PageHeader
        title="Impact"
        subtitle="KashWise succeeds when people earn. Live numbers straight from the database."
        action={
          <div role="group" aria-label="Data shown" className="inline-flex rounded-xl bg-white p-1 ring-1 ring-line">
            {[true, false].map((v) => (
              <button key={String(v)} type="button" aria-pressed={includeDemo === v} onClick={() => setIncludeDemo(v)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${includeDemo === v ? 'bg-brand-600 text-white' : 'text-ink-soft'}`}>
                {v ? 'All data (incl. demo)' : 'Real users only'}
              </button>
            ))}
          </div>
        }
      />
      <p className="mb-5 rounded-xl bg-sun-50 px-4 py-3 text-sm text-sun-700 ring-1 ring-inset ring-sun-100">
        {includeDemo
          ? 'Includes seeded demo accounts and activity from demo logins, clearly labelled across the app. Switch to “Real users only” to see genuine usage.'
          : 'Only activity by real (non-demo) accounts.'}
      </p>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : m ? (
        <>
          <Card className="kasi-pattern mb-4 bg-brand-700 p-6 text-white">
            <p className="text-sm font-semibold text-brand-100">North Star — people who earned money because KashWise connected them to work</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
              <p><span className="text-5xl font-extrabold">{m.people_earned}</span> <span className="text-brand-100">people earned</span></p>
              <p><span className="text-5xl font-extrabold text-sun-400">{formatRand(m.income_earned_cents)}</span> <span className="text-brand-100">paid to workers</span></p>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: 'Match rate', value: percent(m.match_rate), sub: `${m.gigs_matched} of ${m.gigs_posted} gigs matched` },
              { icon: Clock, label: 'Median time to match', value: m.median_hours_to_match !== null ? `${m.median_hours_to_match} h` : '—', sub: 'from posting to choosing a worker' },
              { icon: BadgeCheck, label: 'Verified portfolio records', value: String(m.portfolio_records), sub: 'career capital created' },
              { icon: Star, label: 'Average rating', value: m.avg_rating ? `${Number(m.avg_rating).toFixed(1)} ★` : '—', sub: `${m.reviews} reviews` },
              { icon: Repeat, label: 'Repeat customers', value: String(m.repeat_customers), sub: 'hired the same worker again' },
              { icon: Repeat, label: 'Workers with repeat work', value: String(m.workers_with_repeat_work), sub: '2+ completed gigs' },
              { icon: BadgeCheck, label: 'Completion rate', value: percent(m.completion_rate), sub: 'of resolved matched gigs' },
              { icon: HandCoins, label: 'KashWise fees (simulated)', value: formatRand(m.fees_cents), sub: '10% fee from each job' },
            ].map((x) => (
              <Card key={x.label} className="p-4">
                <x.icon className="size-5 text-brand-600" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold">{x.value}</p>
                <p className="text-sm font-semibold">{x.label}</p>
                <p className="text-xs text-muted">{x.sub}</p>
              </Card>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-bold">Marketplace funnel</h2>
              <ul className="mt-4 space-y-3">
                {funnel.map((f) => (
                  <li key={f.label}>
                    <div className="flex justify-between text-sm"><span>{f.label}</span><span className="font-bold">{f.value}</span></div>
                    <div className="mt-1 h-3 rounded-full bg-canvas">
                      <div className="h-3 rounded-full bg-brand-600" style={{ width: `${(f.value / max) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted">{m.gigs_open} gigs are open right now · {m.workers} workers · {m.customers} customers</p>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold">Most completed work</h2>
              {m.top_categories.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No completed gigs yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {m.top_categories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm">
                      <span><span aria-hidden>{categoryEmoji(c.category)}</span> {categoryLabel(c.category)}</span>
                      <span className="font-bold">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}
      <p className="mt-6 text-sm">
        How could a 10% success fee sustain this? <Link to="/economics" className="font-semibold text-brand-700 underline">Explore the unit-economics scenarios</Link> (assumptions, not results).
      </p>
    </div>
  )
}
