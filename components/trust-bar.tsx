import { ShieldCheck, BookOpen, Scale } from "lucide-react"
import Link from "next/link"

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Verified Reviews",
    description: "Every exchange tested firsthand",
    href: "/about#methodology",
  },
  {
    icon: BookOpen,
    title: "Editorial Standards",
    description: "Transparent and unbiased analysis",
    href: "/about#editorial",
  },
  {
    icon: Scale,
    title: "Full Disclosure",
    description: "Affiliate relationships declared",
    href: "/disclaimer",
  },
]

export function TrustBar() {
  return (
    <section className="border-t border-border bg-card/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-center md:gap-12 lg:px-6">
        {trustItems.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="group flex items-center gap-3 text-center md:text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
