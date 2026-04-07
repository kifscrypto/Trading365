import { notFound } from "next/navigation"
import { isValidLocale, LOCALE_CODES } from "@/lib/i18n/config"

export async function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isValidLocale(locale)) notFound()
  return <>{children}</>
}
