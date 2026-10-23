import { useAreas } from '../lib/hooks'

interface Props {
  id: string
  value: string
  onChange: (slug: string) => void
  invalid?: boolean
  placeholder?: string
  describedBy?: string
}

/** Areas grouped by city. Only the area is ever public — never a street address. */
export function AreaSelect({ id, value, onChange, invalid, placeholder = 'Choose your area', describedBy }: Props) {
  const { data: areas, isLoading } = useAreas()
  const groups = new Map<string, { slug: string; name: string }[]>()
  for (const a of areas ?? []) {
    const key = `${a.city} · ${a.province}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ slug: a.slug, name: a.name })
  }
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      disabled={isLoading}
    >
      <option value="">{isLoading ? 'Loading areas…' : placeholder}</option>
      {[...groups.entries()].map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
