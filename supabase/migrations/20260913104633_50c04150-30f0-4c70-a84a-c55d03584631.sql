ALTER TABLE public.builders
  ADD COLUMN sui_reputation_score integer NOT NULL DEFAULT 0,
  ADD COLUMN verified_package_count integer NOT NULL DEFAULT 0,
  ADD COLUMN builder_achievement_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.builder_sui_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES public.builder_repositories(id) ON DELETE SET NULL,
  package_id text NOT NULL,
  network text NOT NULL DEFAULT 'mainnet' CHECK (network IN ('mainnet', 'testnet', 'devnet')),
  module_count integer NOT NULL DEFAULT 0 CHECK (module_count >= 0),
  package_version bigint NOT NULL DEFAULT 1 CHECK (package_version >= 1),
  verification_source text NOT NULL CHECK (verification_source IN ('github', 'wallet', 'both')),
  verification_status text NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('candidate', 'verified', 'rejected')),
  published_tx_digest text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (builder_id, package_id, network)
);
GRANT SELECT ON public.builder_sui_packages TO anon, authenticated;
GRANT ALL ON public.builder_sui_packages TO service_role;
ALTER TABLE public.builder_sui_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Sui packages follow builder visibility" ON public.builder_sui_packages
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builders b
    WHERE b.id = builder_sui_packages.builder_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));
CREATE TRIGGER touch_builder_sui_packages BEFORE UPDATE ON public.builder_sui_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.ecosystem_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL UNIQUE REFERENCES public.builder_repositories(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text,
  category text NOT NULL,
  package_count integer NOT NULL DEFAULT 0 CHECK (package_count >= 0),
  reputation_score integer NOT NULL DEFAULT 0 CHECK (reputation_score >= 0),
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ecosystem_projects TO anon, authenticated;
GRANT ALL ON public.ecosystem_projects TO service_role;
ALTER TABLE public.ecosystem_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view ecosystem projects" ON public.ecosystem_projects
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builders b
    WHERE b.id = ecosystem_projects.builder_id AND b.is_public = true
  ));
CREATE TRIGGER touch_ecosystem_projects BEFORE UPDATE ON public.ecosystem_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.builder_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target integer NOT NULL DEFAULT 1 CHECK (target > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  earned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (builder_id, achievement_key)
);
GRANT SELECT ON public.builder_achievements TO anon, authenticated;
GRANT ALL ON public.builder_achievements TO service_role;
ALTER TABLE public.builder_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public achievements follow builder visibility" ON public.builder_achievements
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.builders b
    WHERE b.id = builder_achievements.builder_id
      AND (b.is_public OR b.user_id = auth.uid())
  ));
CREATE TRIGGER touch_builder_achievements BEFORE UPDATE ON public.builder_achievements
  FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE INDEX builder_sui_packages_builder_idx ON public.builder_sui_packages(builder_id, verified_at DESC);
CREATE INDEX builder_sui_packages_repository_idx ON public.builder_sui_packages(repository_id);
CREATE INDEX ecosystem_projects_category_reputation_idx ON public.ecosystem_projects(category, reputation_score DESC);
CREATE INDEX ecosystem_projects_builder_idx ON public.ecosystem_projects(builder_id);
CREATE INDEX builder_achievements_builder_idx ON public.builder_achievements(builder_id, earned_at DESC);