CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  reconnect_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.builders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  wallet_address text NOT NULL,
  github_id bigint UNIQUE,
  github_username text UNIQUE,
  github_avatar_url text,
  github_name text,
  github_bio text,
  builder_score integer NOT NULL DEFAULT 0 CHECK (builder_score >= 0),
  builder_level integer NOT NULL DEFAULT 1 CHECK (builder_level >= 1),
  verified_repository_count integer NOT NULL DEFAULT 0 CHECK (verified_repository_count >= 0),
  total_commits integer NOT NULL DEFAULT 0 CHECK (total_commits >= 0),
  total_pull_requests integer NOT NULL DEFAULT 0 CHECK (total_pull_requests >= 0),
  merged_pull_requests integer NOT NULL DEFAULT 0 CHECK (merged_pull_requests >= 0),
  oss_contributions integer NOT NULL DEFAULT 0 CHECK (oss_contributions >= 0),
  contribution_streak integer NOT NULL DEFAULT 0 CHECK (contribution_streak >= 0),
  github_connected boolean NOT NULL DEFAULT false,
  sui_verified boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.builders TO authenticated;
GRANT SELECT ON public.builders TO anon;
GRANT ALL ON public.builders TO service_role;
ALTER TABLE public.builders ENABLE ROW LEVEL SECURITY;
CREATE POLICY builders_public_read ON public.builders FOR SELECT TO anon, authenticated USING (is_public = true OR user_id = auth.uid());
CREATE POLICY builders_owner_insert ON public.builders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY builders_owner_update ON public.builders FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.builder_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  github_repo_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  full_name text NOT NULL,
  html_url text NOT NULL,
  description text,
  primary_language text,
  topics text[] NOT NULL DEFAULT '{}',
  stars integer NOT NULL DEFAULT 0 CHECK (stars >= 0),
  forks integer NOT NULL DEFAULT 0 CHECK (forks >= 0),
  contributors integer NOT NULL DEFAULT 0 CHECK (contributors >= 0),
  commits integer NOT NULL DEFAULT 0 CHECK (commits >= 0),
  pull_requests integer NOT NULL DEFAULT 0 CHECK (pull_requests >= 0),
  merged_pull_requests integer NOT NULL DEFAULT 0 CHECK (merged_pull_requests >= 0),
  issues_resolved integer NOT NULL DEFAULT 0 CHECK (issues_resolved >= 0),
  sui_relevance integer NOT NULL DEFAULT 0 CHECK (sui_relevance BETWEEN 0 AND 100),
  development_score integer NOT NULL DEFAULT 0 CHECK (development_score BETWEEN 0 AND 100),
  quality_score integer NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  building_type text NOT NULL DEFAULT 'dapp',
  building_level integer NOT NULL DEFAULT 1 CHECK (building_level BETWEEN 1 AND 20),
  verified boolean NOT NULL DEFAULT false,
  is_fork boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  default_branch_sha text,
  repo_created_at timestamptz,
  repo_pushed_at timestamptz,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.builder_repositories TO anon, authenticated;
GRANT ALL ON public.builder_repositories TO service_role;
ALTER TABLE public.builder_repositories ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_repositories_public_read ON public.builder_repositories FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.builders b WHERE b.id = builder_id AND (b.is_public = true OR b.user_id = auth.uid())));

CREATE TABLE public.repository_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.builder_repositories(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  label text NOT NULL,
  strength text NOT NULL CHECK (strength IN ('strong','medium','weak')),
  points integer NOT NULL DEFAULT 0,
  evidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, signal_key)
);
GRANT SELECT ON public.repository_signals TO anon, authenticated;
GRANT ALL ON public.repository_signals TO service_role;
ALTER TABLE public.repository_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY repository_signals_public_read ON public.repository_signals FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.builder_repositories r JOIN public.builders b ON b.id = r.builder_id WHERE r.id = repository_id AND (b.is_public = true OR b.user_id = auth.uid())));

CREATE TABLE public.builder_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  activity_day date NOT NULL,
  commits integer NOT NULL DEFAULT 0 CHECK (commits >= 0),
  pull_requests integer NOT NULL DEFAULT 0 CHECK (pull_requests >= 0),
  issues integer NOT NULL DEFAULT 0 CHECK (issues >= 0),
  packages integer NOT NULL DEFAULT 0 CHECK (packages >= 0),
  oss_contributions integer NOT NULL DEFAULT 0 CHECK (oss_contributions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (builder_id, activity_day)
);
GRANT SELECT ON public.builder_activity TO anon, authenticated;
GRANT ALL ON public.builder_activity TO service_role;
ALTER TABLE public.builder_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_activity_public_read ON public.builder_activity FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.builders b WHERE b.id = builder_id AND (b.is_public = true OR b.user_id = auth.uid())));

CREATE TABLE public.builder_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL UNIQUE REFERENCES public.builders(id) ON DELETE CASCADE,
  city_level integer NOT NULL DEFAULT 1 CHECK (city_level >= 1),
  city_score integer NOT NULL DEFAULT 0 CHECK (city_score >= 0),
  tier_key text NOT NULL DEFAULT 'foundation',
  land_slots integer NOT NULL DEFAULT 6 CHECK (land_slots >= 1),
  theme_key text NOT NULL DEFAULT 'sui_dawn',
  blast_committed numeric NOT NULL DEFAULT 0 CHECK (blast_committed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.builder_cities TO anon, authenticated;
GRANT ALL ON public.builder_cities TO service_role;
ALTER TABLE public.builder_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_cities_public_read ON public.builder_cities FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.builders b WHERE b.id = builder_id AND (b.is_public = true OR b.user_id = auth.uid())));

CREATE TABLE public.city_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.builder_cities(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES public.builder_repositories(id) ON DELETE SET NULL,
  building_type text NOT NULL,
  building_level integer NOT NULL DEFAULT 1 CHECK (building_level BETWEEN 1 AND 20),
  district_key text NOT NULL DEFAULT 'core',
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  cosmetic_key text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, repository_id)
);
GRANT SELECT ON public.city_buildings TO anon, authenticated;
GRANT ALL ON public.city_buildings TO service_role;
ALTER TABLE public.city_buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY city_buildings_public_read ON public.city_buildings FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.builder_cities c JOIN public.builders b ON b.id = c.builder_id WHERE c.id = city_id AND (b.is_public = true OR b.user_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.touch_blast_build_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_app_user_connections BEFORE UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();
CREATE TRIGGER touch_builders BEFORE UPDATE ON public.builders FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();
CREATE TRIGGER touch_builder_repositories BEFORE UPDATE ON public.builder_repositories FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();
CREATE TRIGGER touch_builder_cities BEFORE UPDATE ON public.builder_cities FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();
CREATE TRIGGER touch_city_buildings BEFORE UPDATE ON public.city_buildings FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE INDEX builder_repositories_builder_idx ON public.builder_repositories(builder_id);
CREATE INDEX builder_repositories_verified_idx ON public.builder_repositories(builder_id, verified);
CREATE INDEX repository_signals_repository_idx ON public.repository_signals(repository_id);
CREATE INDEX builder_activity_builder_day_idx ON public.builder_activity(builder_id, activity_day DESC);
CREATE INDEX city_buildings_city_idx ON public.city_buildings(city_id);