ALTER TABLE public.builder_cities
  ADD COLUMN builder_power integer NOT NULL DEFAULT 0,
  ADD COLUMN city_power integer NOT NULL DEFAULT 0,
  ADD COLUMN free_land integer NOT NULL DEFAULT 6,
  ADD COLUMN expanded_land integer NOT NULL DEFAULT 0,
  ADD COLUMN progression_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.city_buildings
  ADD COLUMN developer_level integer NOT NULL DEFAULT 1,
  ADD COLUMN developer_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN blast_upgrade_level integer NOT NULL DEFAULT 0;

CREATE TABLE public.city_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.builder_cities(id) ON DELETE CASCADE,
  district_key text NOT NULL,
  label text NOT NULL,
  repository_count integer NOT NULL DEFAULT 0,
  unlocked_by text NOT NULL DEFAULT 'builder' CHECK (unlocked_by IN ('builder', 'blast')),
  blast_cost numeric NOT NULL DEFAULT 0 CHECK (blast_cost >= 0),
  unlocked_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (city_id, district_key)
);
GRANT SELECT ON public.city_districts TO anon, authenticated;
GRANT ALL ON public.city_districts TO service_role;
ALTER TABLE public.city_districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public districts follow city visibility" ON public.city_districts
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builder_cities c
    JOIN public.builders b ON b.id = c.builder_id
    WHERE c.id = city_districts.city_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));
CREATE TRIGGER touch_city_districts BEFORE UPDATE ON public.city_districts
  FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.blast_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.builder_cities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_atomic numeric NOT NULL CHECK (amount_atomic > 0),
  amount_display numeric NOT NULL CHECK (amount_display > 0),
  token_type text NOT NULL,
  network text NOT NULL DEFAULT 'mainnet',
  purpose text NOT NULL CHECK (purpose IN ('land', 'building', 'district', 'cosmetic', 'landmark')),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'pending', 'verified', 'rejected', 'unlocked')),
  transaction_digest text UNIQUE,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blast_commitments TO authenticated;
GRANT ALL ON public.blast_commitments TO service_role;
ALTER TABLE public.blast_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builders can view own BLAST commitments" ON public.blast_commitments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER touch_blast_commitments BEFORE UPDATE ON public.blast_commitments
  FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.building_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.city_buildings(id) ON DELETE CASCADE,
  commitment_id uuid REFERENCES public.blast_commitments(id) ON DELETE RESTRICT,
  from_level integer NOT NULL CHECK (from_level >= 0),
  to_level integer NOT NULL CHECK (to_level > from_level),
  upgrade_source text NOT NULL CHECK (upgrade_source IN ('github', 'blast')),
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('preview', 'pending', 'verified', 'rejected', 'reverted')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.building_upgrades TO anon, authenticated;
GRANT ALL ON public.building_upgrades TO service_role;
ALTER TABLE public.building_upgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public upgrades follow city visibility" ON public.building_upgrades
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.city_buildings cb
    JOIN public.builder_cities c ON c.id = cb.city_id
    JOIN public.builders b ON b.id = c.builder_id
    WHERE cb.id = building_upgrades.building_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));

CREATE TABLE public.city_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.builder_cities(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES public.builder_repositories(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('repository_discovered', 'repository_verified', 'commit_activity', 'pull_request_opened', 'pull_request_merged', 'developer_level_up', 'city_level_up', 'district_unlocked', 'blast_construction')),
  title text NOT NULL,
  description text,
  event_value integer NOT NULL DEFAULT 0,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.city_events TO anon, authenticated;
GRANT ALL ON public.city_events TO service_role;
ALTER TABLE public.city_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public events follow city visibility" ON public.city_events
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builder_cities c
    JOIN public.builders b ON b.id = c.builder_id
    WHERE c.id = city_events.city_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));

CREATE TABLE public.builder_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  label text NOT NULL,
  evidence text NOT NULL,
  earned_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (builder_id, badge_key)
);
GRANT SELECT ON public.builder_badges TO anon, authenticated;
GRANT ALL ON public.builder_badges TO service_role;
ALTER TABLE public.builder_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public badges follow builder visibility" ON public.builder_badges
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builders b
    WHERE b.id = builder_badges.builder_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));

CREATE INDEX city_districts_city_idx ON public.city_districts(city_id);
CREATE INDEX blast_commitments_builder_idx ON public.blast_commitments(builder_id, created_at DESC);
CREATE INDEX building_upgrades_building_idx ON public.building_upgrades(building_id, created_at DESC);
CREATE INDEX city_events_city_time_idx ON public.city_events(city_id, occurred_at DESC);
CREATE INDEX builder_badges_builder_idx ON public.builder_badges(builder_id);

UPDATE public.builder_cities c
SET builder_power = b.builder_score,
    city_power = GREATEST(0, FLOOR(c.blast_committed)::integer),
    free_land = GREATEST(6, b.verified_repository_count + 4)
FROM public.builders b
WHERE b.id = c.builder_id;

UPDATE public.city_buildings cb
SET developer_level = br.building_level,
    developer_xp = LEAST(10000, br.commits * 3 + br.merged_pull_requests * 12 + br.contributors * 20 + br.sui_relevance * 2)
FROM public.builder_repositories br
WHERE br.id = cb.repository_id;