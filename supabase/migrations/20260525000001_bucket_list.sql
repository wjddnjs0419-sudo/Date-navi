CREATE TABLE IF NOT EXISTS bucket_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id text NOT NULL,
  item text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bucket_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bucket_couple_read" ON bucket_list FOR SELECT USING (
  couple_id IN (
    SELECT couple_id FROM date_planner_profiles WHERE user_id = auth.uid()
  )
);
CREATE POLICY "bucket_owner_insert" ON bucket_list FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "bucket_owner_update" ON bucket_list FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE TABLE IF NOT EXISTS bucket_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES bucket_list(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('love', 'next_time')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, user_id)
);

ALTER TABLE bucket_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bucket_rx_couple_read" ON bucket_reactions FOR SELECT USING (
  bucket_id IN (
    SELECT bl.id FROM bucket_list bl
    JOIN date_planner_profiles p ON p.couple_id = bl.couple_id
    WHERE p.user_id = auth.uid()
  )
);
CREATE POLICY "bucket_rx_owner_insert" ON bucket_reactions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "bucket_rx_owner_update" ON bucket_reactions FOR UPDATE USING (
  user_id = auth.uid()
);
