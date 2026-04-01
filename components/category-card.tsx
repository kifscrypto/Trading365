import Link from "next/link"
import { ArrowUpRight, type LucideIcon } from "lucide-react"

interface CategoryCardProps {
  title: string
  description: string
  href: string
  icon: LucideIcon
  count: number
}

export function CategoryCard({
  title,
  description,
  href,
  icon: Icon,
  count,
}: CategoryCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_30px_-5px] hover:shadow-primary/10"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="text-xs font-medium text-primary">{count} articles</p>
    </Link>
  )
}
