import { Brush, Camera, Car, ChefHat, Flower2, GraduationCap, Laptop, Package, Scissors, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
const icons: Record<string, LucideIcon> = { cleaning: Sparkles, gardening: Flower2, tutoring: GraduationCap, 'hair-beauty': Scissors, repairs: Wrench, painting: Brush, catering: ChefHat, photography: Camera, moving: Package, 'tech-support': Laptop, automotive: Car }
export function CategoryIcon({ category, className = 'size-5' }: { category: string; className?: string }) {
  const Icon = icons[category] ?? Sparkles
  return <Icon className={className} strokeWidth={1.6} aria-hidden />
}
