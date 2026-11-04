CREATE TABLE IF NOT EXISTS desk_downloads (
  id SERIAL PRIMARY KEY,
  product TEXT NOT NULL,
  country TEXT,
  is_bot BOOLEAN DEFAULT FALSE,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desk_downloads_created_at ON desk_downloads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_desk_downloads_is_bot ON desk_downloads (is_bot);
