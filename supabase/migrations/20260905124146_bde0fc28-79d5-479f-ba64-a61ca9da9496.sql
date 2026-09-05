
-- ===== enums =====
CREATE TYPE public.app_role AS ENUM ('admin','moderator','player');
CREATE TYPE public.meme_status AS ENUM ('pending','approved','rejected');

-- ===== profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  wallet_address text UNIQUE NOT NULL,
  nickname text UNIQUE,
  avatar_seed text NOT NULL DEFAULT gen_random_uuid()::text,
  points integer NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  best_score integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_login_day date,
  is_banned boolean NOT NULL DEFAULT false,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND is_banned = false) WITH CHECK (auth.uid() = id);

-- ===== roles =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'));
$$;

CREATE POLICY "roles_staff_read_all" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ===== game sessions =====
CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_key text NOT NULL DEFAULT 'blast_click',
  score integer NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  max_combo integer NOT NULL DEFAULT 1,
  duration_ms integer NOT NULL DEFAULT 30000,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_sessions_score_idx ON public.game_sessions (score DESC);
CREATE INDEX game_sessions_created_idx ON public.game_sessions (created_at DESC);
GRANT SELECT ON public.game_sessions TO anon;
GRANT SELECT ON public.game_sessions TO authenticated;
GRANT ALL ON public.game_sessions TO service_role;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_public_read" ON public.game_sessions FOR SELECT USING (true);

-- ===== points ledger =====
CREATE TABLE public.points_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  dedupe_key text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX points_dedupe_idx ON public.points_transactions (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
GRANT SELECT ON public.points_transactions TO authenticated;
GRANT ALL ON public.points_transactions TO service_role;
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "points_read_own" ON public.points_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_profile_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET points = GREATEST(0, points + NEW.amount), updated_at = now() WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER points_sync AFTER INSERT ON public.points_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_points();

CREATE OR REPLACE FUNCTION public.award_points(_user_id uuid, _amount integer, _reason text, _dedupe_key text DEFAULT NULL, _actor_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted integer := 0;
BEGIN
  INSERT INTO public.points_transactions (user_id, amount, reason, dedupe_key, actor_id)
  VALUES (_user_id, _amount, _reason, _dedupe_key, _actor_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN CASE WHEN inserted > 0 THEN _amount ELSE 0 END;
END; $$;

-- ===== daily challenges =====
CREATE TABLE public.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  description text NOT NULL,
  target integer NOT NULL DEFAULT 30,
  reward_points integer NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_challenges TO anon, authenticated;
GRANT ALL ON public.daily_challenges TO service_role;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges_public_read" ON public.daily_challenges FOR SELECT USING (true);
CREATE POLICY "challenges_staff_write" ON public.daily_challenges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.challenge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
GRANT SELECT ON public.challenge_entries TO anon, authenticated;
GRANT ALL ON public.challenge_entries TO service_role;
ALTER TABLE public.challenge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_public_read" ON public.challenge_entries FOR SELECT USING (true);

-- ===== chat =====
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  body text NOT NULL,
  reply_to uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_created_idx ON public.chat_messages (created_at DESC);
GRANT SELECT ON public.chat_messages TO anon;
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_public_read" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "chat_insert_own" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND length(btrim(body)) BETWEEN 1 AND 400
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_banned = false AND (p.muted_until IS NULL OR p.muted_until < now()))
  );
CREATE POLICY "chat_update_own_or_staff" ON public.chat_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.chat_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent integer;
BEGIN
  SELECT count(*) INTO recent FROM public.chat_messages
   WHERE user_id = NEW.user_id AND created_at > now() - interval '10 seconds';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'Slow down — too many messages';
  END IF;
  NEW.body := btrim(NEW.body);
  RETURN NEW;
END; $$;
CREATE TRIGGER chat_rate_limit_trg BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_rate_limit();

CREATE TABLE public.chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT ON public.chat_reactions TO anon;
GRANT SELECT, INSERT, DELETE ON public.chat_reactions TO authenticated;
GRANT ALL ON public.chat_reactions TO service_role;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_public_read" ON public.chat_reactions FOR SELECT USING (true);
CREATE POLICY "reactions_write_own" ON public.chat_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reactions_delete_own" ON public.chat_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_own" ON public.user_blocks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== memes =====
CREATE TABLE public.memes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  image_url text NOT NULL,
  status public.meme_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  wins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.memes TO anon;
GRANT SELECT, INSERT, UPDATE ON public.memes TO authenticated;
GRANT ALL ON public.memes TO service_role;
ALTER TABLE public.memes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memes_read_approved" ON public.memes FOR SELECT USING (status = 'approved');
CREATE POLICY "memes_read_own" ON public.memes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "memes_insert_own" ON public.memes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_banned = false));
CREATE POLICY "memes_staff_update" ON public.memes FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.meme_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  meme_a uuid NOT NULL REFERENCES public.memes(id) ON DELETE CASCADE,
  meme_b uuid NOT NULL REFERENCES public.memes(id) ON DELETE CASCADE,
  winner_id uuid REFERENCES public.memes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meme_battles TO anon, authenticated;
GRANT ALL ON public.meme_battles TO service_role;
ALTER TABLE public.meme_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battles_public_read" ON public.meme_battles FOR SELECT USING (true);

CREATE TABLE public.meme_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.meme_battles(id) ON DELETE CASCADE,
  meme_id uuid NOT NULL REFERENCES public.memes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id)
);
GRANT SELECT ON public.meme_votes TO anon, authenticated;
GRANT ALL ON public.meme_votes TO service_role;
ALTER TABLE public.meme_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes_public_read" ON public.meme_votes FOR SELECT USING (true);

-- ===== achievements =====
CREATE TABLE public.achievements (
  key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏅',
  reward_points integer NOT NULL DEFAULT 1000,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_public_read" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "achievements_admin_write" ON public.achievements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_key text NOT NULL REFERENCES public.achievements(key) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);
GRANT SELECT ON public.user_achievements TO anon, authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_achievements_public_read" ON public.user_achievements FOR SELECT USING (true);

-- ===== moderation audit =====
CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_user_id uuid,
  target_ref text,
  action text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_staff_read" ON public.moderation_actions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ===== realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meme_votes;

-- ===== seed =====
INSERT INTO public.achievements (key,title,description,icon,reward_points,sort_order) VALUES
 ('early_blast','Early Blast','Joined OURBLAST in the first season','🏅',1000,1),
 ('first_blood','First Blast','Played your very first arcade run','💥',1000,2),
 ('arcade_master','Arcade Master','Scored over 8,000 in Blast Click','🕹️',1000,3),
 ('meme_warrior','Meme Warrior','Submitted 5 memes to the battle','😂',1000,4),
 ('daily_grinder','Daily Grinder','Kept a 7-day streak alive','🔥',1000,5),
 ('chatterblast','Chatterblast','Sent 100 messages in Blast Chat','💬',1000,6);

INSERT INTO public.daily_challenges (day,title,description,target,reward_points) VALUES
 (CURRENT_DATE,'CLICK BLAST 30 TIMES AS FAST AS POSSIBLE','Hit the BLAST button 30 times before the timer runs out. Fastest fingers climb the board.',30,500);

INSERT INTO public.profiles (id, wallet_address, nickname, points, games_played, best_score, streak, created_at) VALUES
 ('11111111-1111-4111-8111-111111111101','0x82a1c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f891a','BlastKid',98420,64,98420,11, now() - interval '30 days'),
 ('11111111-1111-4111-8111-111111111102','0x93b2d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091b2','MemeLord',91220,58,91220,9, now() - interval '28 days'),
 ('11111111-1111-4111-8111-111111111103','0xa4c3e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091c3d4','SuiDegen',87110,51,87110,6, now() - interval '26 days'),
 ('11111111-1111-4111-8111-111111111104','0xb5d4f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091d4e5f6','HelmetOn',74300,44,74300,4, now() - interval '21 days'),
 ('11111111-1111-4111-8111-111111111105','0xc6e5081920a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091e5f60718','ClickGoblin',66180,39,66180,3, now() - interval '18 days'),
 ('11111111-1111-4111-8111-111111111106','0xd7f6192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091f60718293a','WenBlast',52940,31,52940,2, now() - interval '14 days'),
 ('11111111-1111-4111-8111-111111111107','0xe8072a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80910718293a4b5c','RugSurvivor',41220,25,41220,5, now() - interval '11 days'),
 ('11111111-1111-4111-8111-111111111108','0xf9183b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091293a4b5c6d7e8f','GasFeeGary',28760,17,28760,1, now() - interval '7 days');

INSERT INTO public.game_sessions (user_id, score, clicks, max_combo, created_at)
SELECT p.id, p.best_score - (g * 3200), 120 - g*7, 8 - g, now() - (g || ' hours')::interval
FROM public.profiles p CROSS JOIN generate_series(0,3) g
WHERE p.id::text LIKE '11111111-%';

INSERT INTO public.user_achievements (user_id, achievement_key)
SELECT p.id, a.key FROM public.profiles p CROSS JOIN public.achievements a
WHERE p.nickname IN ('BlastKid','MemeLord') AND a.key IN ('early_blast','first_blood','arcade_master','daily_grinder');
