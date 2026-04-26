"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"
import { Menu, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { LOCALES } from "@/lib/i18n/config"
import { SiteSearch } from "@/components/site-search"

const navLinks = [
  { href: "/reviews", label: "Reviews" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/compare", label: "Compare Tool" },
  { href: "/no-kyc", label: "No-KYC" },
  { href: "/bonuses", label: "Bonuses" },
  { href: "/guides", label: "Guides" },
  { href: "/scanner", label: "Signals" },
  { href: "/join-our-newsletter", label: "Newsletter" },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "bg-background/90 backdrop-blur-xl border-b border-border shadow-lg shadow-background/50"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/images/logo-icon.png"
            alt="Trading365"
            width={36}
            height={36}
            className="rounded-lg h-9 w-9"
          />
          <span className="text-lg font-bold tracking-tight text-foreground hidden sm:inline">
            Trading<span className="text-primary">365</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <SiteSearch />
          {/* Language switcher */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              aria-label="Select language"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs">EN</span>
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-zinc-900 shadow-xl py-1">
                <Link
                  href="/"
                  onClick={() => setLangOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground bg-primary/10 font-medium"
                >
                  <span>🇬🇧</span> English
                </Link>
                <div className="border-t border-border my-1" />
                {LOCALES.map((loc) => (
                  <Link
                    key={loc.code}
                    href={`/${loc.code}`}
                    onClick={() => setLangOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-zinc-800 hover:text-foreground transition-colors"
                  >
                    <span>{loc.flag}</span> {loc.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" className="font-semibold" asChild>
            <Link href="/bonuses">Get Bonuses</Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-background border-border w-72">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <Image
                  src="/images/logo-icon.png"
                  alt="Trading365"
                  width={28}
                  height={28}
                  className="rounded-lg h-7 w-7"
                />
                Trading<span className="text-primary">365</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pt-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4">
                <Button className="w-full font-semibold" size="sm" asChild>
                  <Link href="/bonuses">Get Bonuses</Link>
                </Button>
              </div>
              <div className="pt-4 border-t border-border mt-2">
                <p className="px-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Languages</p>
                {LOCALES.map((loc) => (
                  <Link
                    key={loc.code}
                    href={`/${loc.code}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <span>{loc.flag}</span> {loc.name}
                  </Link>
                ))}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
