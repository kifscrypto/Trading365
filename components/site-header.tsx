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
import { DiscordIcon } from "@/components/discord-icon"
import { siteConfig } from "@/lib/data/site-config"

const navLinks = [
  // The scanner cluster leads. It is the product — the rest of the menu is
  // content that supports it — and it used to sit last, behind six content
  // pillars, so nothing in the chrome said the site runs scanners at all.
  { href: "/scanner", label: "Scanner" },
  { href: "/signals", label: "Verified Results" },
  // The account is the conversion path for everything above, and until now the
  // only way to find it was the pricing buttons on /scanner — nothing in the
  // chrome admitted the site has free accounts at all.
  { href: "/signup", label: "Join free" },
  { href: "/reviews", label: "Reviews" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/no-kyc", label: "No-KYC" },
  { href: "/bonuses", label: "Bonuses" },
  { href: "/guides", label: "Guides" },
  { href: "/scam-alerts", label: "Scam Alerts" },
  // /compare is reached from the homepage CTA and the sitemap — it does not need
  // a permanent slot next to "Comparisons", which it read as a duplicate of.
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
            Trading<span className="text-[var(--t-green)]">365</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary whitespace-nowrap",
                // "Join free" is an invitation to sign up, and it sat directly
                // beside a "Sign in" button — so a member was being invited to do
                // both at once. Hidden once signed in, where "My account" is the
                // useful offer instead. Toggled by the pre-paint script in
                // app/layout.tsx; the rules live in app/globals.css.
                link.href === "/signup" && "auth-when-out",
              )}
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
          {/* Icon-only Discord entry point. It sits with the other header
              actions, which are lg-and-up: at smaller widths this whole cluster
              is already hidden, so the icon cannot crowd the mobile header. It
              renders nothing when no invite is configured, matching the CTA. */}
          {siteConfig.socials.discord && (
            <a
              href={siteConfig.socials.discord}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the Trading365 Discord on Discord"
              title="Join the Trading365 Discord"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#5865F2]/15 hover:text-[#5865F2]"
            >
              <DiscordIcon className="h-[18px] w-[18px]" />
            </a>
          )}
          {/* The header only ever offered "Create free account", so a returning
              member had no way in: their options were to create a SECOND account
              or to guess /login. Sign in is a ghost button so it stays visually
              subordinate to the conversion CTA next to it — it exists for the
              people who already converted.

              BOTH states are rendered and CSS picks one, so a signed-in member
              sees "My account" on the very first frame rather than watching
              "Sign in" swap out. The rules are in app/globals.css and the flag is
              set by the pre-paint script in app/layout.tsx. */}
          <Button
            size="sm"
            variant="ghost"
            className="auth-when-out font-semibold text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="auth-when-in font-semibold text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/account">My account</Link>
          </Button>
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
                Trading<span className="text-[var(--t-green)]">365</span>
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
              {/* CTAs in the mobile sheet. Sign in leads for the returning member,
                  the account is the conversion path, bonuses is the affiliate one.
                  Filled = account.

                  Same CSS swap as the desktop header: both states are rendered and
                  app/globals.css picks one, so a member never sees "Sign in" and
                  "Create free account" in a drawer they have already completed. */}
              <div className="flex flex-col gap-2 pt-4">
                <Button className="auth-when-out w-full font-semibold" size="sm" variant="ghost" asChild>
                  <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
                </Button>
                <Button className="auth-when-in w-full font-semibold" size="sm" variant="ghost" asChild>
                  <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
                </Button>
                <Button className="auth-when-out w-full font-semibold" size="sm" asChild>
                  <Link href="/signup">Create free account</Link>
                </Button>
                <Button className="w-full font-semibold" size="sm" variant="outline" asChild>
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
