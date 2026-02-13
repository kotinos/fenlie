CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, name)
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  image_url TEXT,
  paid_by TEXT,
  status TEXT DEFAULT 'manual' CHECK (status IN ('processing','parsed','error','manual')),
  restaurant_name TEXT,
  date TEXT,
  tax NUMERIC(10,2) DEFAULT 0,
  tip NUMERIC(10,2) DEFAULT 0,
  fees NUMERIC(10,2) DEFAULT 0,
  subtotal NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(10,2) DEFAULT 0,
  total_price NUMERIC(10,2) DEFAULT 0,
  claimed_by TEXT[] DEFAULT '{}',
  is_edited BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0
);

ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE line_items DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_item(item_id uuid, person text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE line_items
  SET claimed_by = array_append(claimed_by, person)
  WHERE id = item_id
    AND NOT (person = ANY(claimed_by));
END;
$$;

CREATE OR REPLACE FUNCTION public.unclaim_item(item_id uuid, person text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE line_items
  SET claimed_by = array_remove(claimed_by, person)
  WHERE id = item_id;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE sessions, participants, receipts, line_items;

CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_receipts_session ON receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_line_items_receipt ON line_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_sessions_share_code ON sessions(share_code);
