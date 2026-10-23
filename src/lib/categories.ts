export interface Category {
  slug: string
  label: string
  emoji: string
}

// Must match the category check constraints in supabase/migrations/*_core_schema.sql.
export const CATEGORIES: Category[] = [
  { slug: 'cleaning', label: 'Cleaning', emoji: '🧽' },
  { slug: 'gardening', label: 'Gardening', emoji: '🌱' },
  { slug: 'tutoring', label: 'Tutoring', emoji: '📚' },
  { slug: 'hair-beauty', label: 'Hair & beauty', emoji: '💇🏾' },
  { slug: 'repairs', label: 'Repairs & handyman', emoji: '🔧' },
  { slug: 'painting', label: 'Painting', emoji: '🎨' },
  { slug: 'catering', label: 'Catering & cooking', emoji: '🍲' },
  { slug: 'photography', label: 'Photography', emoji: '📷' },
  { slug: 'moving', label: 'Moving help', emoji: '📦' },
  { slug: 'tech-support', label: 'Tech support', emoji: '💻' },
  { slug: 'automotive', label: 'Automotive', emoji: '🚗' },
  { slug: 'other', label: 'Other', emoji: '✨' },
]

const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]))

export function categoryLabel(slug: string): string {
  return bySlug.get(slug)?.label ?? slug
}

export function categoryEmoji(slug: string): string {
  return bySlug.get(slug)?.emoji ?? '✨'
}

export function isCategory(slug: string): boolean {
  return bySlug.has(slug)
}
