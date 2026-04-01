import Link from "next/link"
import Image from "next/image"
import { Clock, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ArticleCardProps {
  title: string
  excerpt: string
  category: string
  categorySlug: string
  slug: string
  date: string
  readTime: string
  rating?: number
  thumbnail?: string
}

export function ArticleCard({
  title,
  excerpt,
  category,
  categorySlug,
  slug,
  date,
  readTime,
  rating,
  thumbnail,
}: ArticleCardProps) {
  return (
    <Link
      href={`/${categorySlug}/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_30px_-5px] hover:shadow-primary/10"
    >
      {thumbnail && (
        <div className="relative h-44 w-full overflow-hidden">
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
          {rating && (
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-background/80 backdrop-blur-sm px-2 py-1">
              <span className="text-xs font-bold text-primary">{rating}</span>
              <span className="text-xs text-primary/70">/10</span>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className="bg-secondary text-secondary-foreground text-xs"
          >
            {category}
          </Badge>
          {!thumbnail && rating && (
            <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5">
              <span className="text-xs font-bold text-primary">{rating}</span>
              <span className="text-xs text-primary/70">/10</span>
            </div>
          )}
        </div>
        <h3 className="text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary text-balance">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
          {excerpt}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{date}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {readTime}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </Link>
  )
}
