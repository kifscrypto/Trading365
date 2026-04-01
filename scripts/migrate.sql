CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  excerpt     TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'No-KYC',
  category_slug TEXT NOT NULL DEFAULT 'no-kyc',
  date        TEXT NOT NULL DEFAULT '',
  updated_date TEXT,
  read_time   TEXT NOT NULL DEFAULT '',
  author      TEXT NOT NULL DEFAULT '',
  rating      NUMERIC(4,1),
  thumbnail   TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  faqs        JSONB NOT NULL DEFAULT '[]',
  meta_title       TEXT,
  meta_description TEXT,
  meta_keywords    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Run this if the table already exists to add the SEO columns:
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_keywords TEXT;
