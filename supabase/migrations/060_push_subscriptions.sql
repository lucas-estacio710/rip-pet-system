-- Push notification subscriptions (Web Push API)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  unidade_id uuid REFERENCES unidades(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role needs full access to send notifications
CREATE POLICY "Service role full access" ON push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Index
CREATE INDEX idx_push_subscriptions_unidade ON push_subscriptions(unidade_id);

-- =============================================
-- Realtime: ensure fichas table is in publication
-- =============================================
-- This is idempotent — if already added, will no-op
DO $$
BEGIN
  -- Check if fichas is already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fichas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fichas;
  END IF;
END $$;
