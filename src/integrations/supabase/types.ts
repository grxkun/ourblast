export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          icon: string
          key: string
          reward_points: number
          sort_order: number
          title: string
        }
        Insert: {
          description: string
          icon?: string
          key: string
          reward_points?: number
          sort_order?: number
          title: string
        }
        Update: {
          description?: string
          icon?: string
          key?: string
          reward_points?: number
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blast_commitments: {
        Row: {
          amount_atomic: number
          amount_display: number
          builder_id: string
          city_id: string
          created_at: string
          id: string
          network: string
          purpose: string
          status: string
          token_type: string
          transaction_digest: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount_atomic: number
          amount_display: number
          builder_id: string
          city_id: string
          created_at?: string
          id?: string
          network?: string
          purpose: string
          status?: string
          token_type: string
          transaction_digest?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount_atomic?: number
          amount_display?: number
          builder_id?: string
          city_id?: string
          created_at?: string
          id?: string
          network?: string
          purpose?: string
          status?: string
          token_type?: string
          transaction_digest?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blast_commitments_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blast_commitments_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "builder_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_achievements: {
        Row: {
          achievement_key: string
          builder_id: string
          created_at: string
          description: string
          earned_at: string | null
          evidence: Json
          id: string
          label: string
          progress: number
          target: number
          updated_at: string
        }
        Insert: {
          achievement_key: string
          builder_id: string
          created_at?: string
          description: string
          earned_at?: string | null
          evidence?: Json
          id?: string
          label: string
          progress?: number
          target?: number
          updated_at?: string
        }
        Update: {
          achievement_key?: string
          builder_id?: string
          created_at?: string
          description?: string
          earned_at?: string | null
          evidence?: Json
          id?: string
          label?: string
          progress?: number
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_achievements_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_activity: {
        Row: {
          activity_day: string
          builder_id: string
          commits: number
          created_at: string
          id: string
          issues: number
          oss_contributions: number
          packages: number
          pull_requests: number
        }
        Insert: {
          activity_day: string
          builder_id: string
          commits?: number
          created_at?: string
          id?: string
          issues?: number
          oss_contributions?: number
          packages?: number
          pull_requests?: number
        }
        Update: {
          activity_day?: string
          builder_id?: string
          commits?: number
          created_at?: string
          id?: string
          issues?: number
          oss_contributions?: number
          packages?: number
          pull_requests?: number
        }
        Relationships: [
          {
            foreignKeyName: "builder_activity_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_badges: {
        Row: {
          badge_key: string
          builder_id: string
          created_at: string
          earned_at: string
          evidence: string
          id: string
          label: string
        }
        Insert: {
          badge_key: string
          builder_id: string
          created_at?: string
          earned_at?: string
          evidence: string
          id?: string
          label: string
        }
        Update: {
          badge_key?: string
          builder_id?: string
          created_at?: string
          earned_at?: string
          evidence?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_badges_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_cities: {
        Row: {
          blast_committed: number
          builder_id: string
          builder_power: number
          city_level: number
          city_power: number
          city_score: number
          created_at: string
          expanded_land: number
          free_land: number
          id: string
          land_slots: number
          progression_version: number
          theme_key: string
          tier_key: string
          updated_at: string
        }
        Insert: {
          blast_committed?: number
          builder_id: string
          builder_power?: number
          city_level?: number
          city_power?: number
          city_score?: number
          created_at?: string
          expanded_land?: number
          free_land?: number
          id?: string
          land_slots?: number
          progression_version?: number
          theme_key?: string
          tier_key?: string
          updated_at?: string
        }
        Update: {
          blast_committed?: number
          builder_id?: string
          builder_power?: number
          city_level?: number
          city_power?: number
          city_score?: number
          created_at?: string
          expanded_land?: number
          free_land?: number
          id?: string
          land_slots?: number
          progression_version?: number
          theme_key?: string
          tier_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_cities_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: true
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_repositories: {
        Row: {
          analyzed_at: string
          builder_id: string
          building_level: number
          building_type: string
          commits: number
          contributors: number
          created_at: string
          default_branch_sha: string | null
          description: string | null
          development_score: number
          forks: number
          full_name: string
          github_repo_id: number
          html_url: string
          id: string
          is_archived: boolean
          is_fork: boolean
          issues_resolved: number
          merged_pull_requests: number
          name: string
          primary_language: string | null
          pull_requests: number
          quality_score: number
          repo_created_at: string | null
          repo_pushed_at: string | null
          stars: number
          sui_relevance: number
          topics: string[]
          updated_at: string
          verified: boolean
        }
        Insert: {
          analyzed_at?: string
          builder_id: string
          building_level?: number
          building_type?: string
          commits?: number
          contributors?: number
          created_at?: string
          default_branch_sha?: string | null
          description?: string | null
          development_score?: number
          forks?: number
          full_name: string
          github_repo_id: number
          html_url: string
          id?: string
          is_archived?: boolean
          is_fork?: boolean
          issues_resolved?: number
          merged_pull_requests?: number
          name: string
          primary_language?: string | null
          pull_requests?: number
          quality_score?: number
          repo_created_at?: string | null
          repo_pushed_at?: string | null
          stars?: number
          sui_relevance?: number
          topics?: string[]
          updated_at?: string
          verified?: boolean
        }
        Update: {
          analyzed_at?: string
          builder_id?: string
          building_level?: number
          building_type?: string
          commits?: number
          contributors?: number
          created_at?: string
          default_branch_sha?: string | null
          description?: string | null
          development_score?: number
          forks?: number
          full_name?: string
          github_repo_id?: number
          html_url?: string
          id?: string
          is_archived?: boolean
          is_fork?: boolean
          issues_resolved?: number
          merged_pull_requests?: number
          name?: string
          primary_language?: string | null
          pull_requests?: number
          quality_score?: number
          repo_created_at?: string | null
          repo_pushed_at?: string | null
          stars?: number
          sui_relevance?: number
          topics?: string[]
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "builder_repositories_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_sui_packages: {
        Row: {
          builder_id: string
          created_at: string
          evidence: Json
          first_seen_at: string
          id: string
          module_count: number
          network: string
          package_id: string
          package_version: number
          published_tx_digest: string | null
          repository_id: string | null
          updated_at: string
          verification_source: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          builder_id: string
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          module_count?: number
          network?: string
          package_id: string
          package_version?: number
          published_tx_digest?: string | null
          repository_id?: string | null
          updated_at?: string
          verification_source: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          builder_id?: string
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          module_count?: number
          network?: string
          package_id?: string
          package_version?: number
          published_tx_digest?: string | null
          repository_id?: string | null
          updated_at?: string
          verification_source?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_sui_packages_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_sui_packages_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "builder_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      builders: {
        Row: {
          builder_achievement_count: number
          builder_level: number
          builder_score: number
          contribution_streak: number
          created_at: string
          github_avatar_url: string | null
          github_bio: string | null
          github_connected: boolean
          github_id: number | null
          github_name: string | null
          github_username: string | null
          id: string
          is_public: boolean
          last_synced_at: string | null
          merged_pull_requests: number
          oss_contributions: number
          sui_reputation_score: number
          sui_verified: boolean
          total_commits: number
          total_pull_requests: number
          updated_at: string
          user_id: string
          verified_package_count: number
          verified_repository_count: number
          wallet_address: string
        }
        Insert: {
          builder_achievement_count?: number
          builder_level?: number
          builder_score?: number
          contribution_streak?: number
          created_at?: string
          github_avatar_url?: string | null
          github_bio?: string | null
          github_connected?: boolean
          github_id?: number | null
          github_name?: string | null
          github_username?: string | null
          id?: string
          is_public?: boolean
          last_synced_at?: string | null
          merged_pull_requests?: number
          oss_contributions?: number
          sui_reputation_score?: number
          sui_verified?: boolean
          total_commits?: number
          total_pull_requests?: number
          updated_at?: string
          user_id: string
          verified_package_count?: number
          verified_repository_count?: number
          wallet_address: string
        }
        Update: {
          builder_achievement_count?: number
          builder_level?: number
          builder_score?: number
          contribution_streak?: number
          created_at?: string
          github_avatar_url?: string | null
          github_bio?: string | null
          github_connected?: boolean
          github_id?: number | null
          github_name?: string | null
          github_username?: string | null
          id?: string
          is_public?: boolean
          last_synced_at?: string | null
          merged_pull_requests?: number
          oss_contributions?: number
          sui_reputation_score?: number
          sui_verified?: boolean
          total_commits?: number
          total_pull_requests?: number
          updated_at?: string
          user_id?: string
          verified_package_count?: number
          verified_repository_count?: number
          wallet_address?: string
        }
        Relationships: []
      }
      building_upgrades: {
        Row: {
          building_id: string
          commitment_id: string | null
          created_at: string
          from_level: number
          id: string
          status: string
          to_level: number
          upgrade_source: string
        }
        Insert: {
          building_id: string
          commitment_id?: string | null
          created_at?: string
          from_level: number
          id?: string
          status?: string
          to_level: number
          upgrade_source: string
        }
        Update: {
          building_id?: string
          commitment_id?: string | null
          created_at?: string
          from_level?: number
          id?: string
          status?: string
          to_level?: number
          upgrade_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_upgrades_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "city_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_upgrades_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "blast_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_entries: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          score: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          score?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "daily_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          payment_id: string | null
          reply_to: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          payment_id?: string | null
          reply_to?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          payment_id?: string | null
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sui_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      city_buildings: {
        Row: {
          blast_upgrade_level: number
          building_level: number
          building_type: string
          city_id: string
          cosmetic_key: string
          created_at: string
          developer_level: number
          developer_xp: number
          district_key: string
          id: string
          position_x: number
          position_y: number
          repository_id: string | null
          updated_at: string
        }
        Insert: {
          blast_upgrade_level?: number
          building_level?: number
          building_type: string
          city_id: string
          cosmetic_key?: string
          created_at?: string
          developer_level?: number
          developer_xp?: number
          district_key?: string
          id?: string
          position_x?: number
          position_y?: number
          repository_id?: string | null
          updated_at?: string
        }
        Update: {
          blast_upgrade_level?: number
          building_level?: number
          building_type?: string
          city_id?: string
          cosmetic_key?: string
          created_at?: string
          developer_level?: number
          developer_xp?: number
          district_key?: string
          id?: string
          position_x?: number
          position_y?: number
          repository_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_buildings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "builder_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_buildings_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "builder_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      city_districts: {
        Row: {
          blast_cost: number
          city_id: string
          created_at: string
          district_key: string
          id: string
          label: string
          repository_count: number
          unlocked_at: string
          unlocked_by: string
          updated_at: string
        }
        Insert: {
          blast_cost?: number
          city_id: string
          created_at?: string
          district_key: string
          id?: string
          label: string
          repository_count?: number
          unlocked_at?: string
          unlocked_by?: string
          updated_at?: string
        }
        Update: {
          blast_cost?: number
          city_id?: string
          created_at?: string
          district_key?: string
          id?: string
          label?: string
          repository_count?: number
          unlocked_at?: string
          unlocked_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_districts_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "builder_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      city_events: {
        Row: {
          city_id: string
          created_at: string
          description: string | null
          event_type: string
          event_value: number
          id: string
          occurred_at: string
          repository_id: string | null
          title: string
        }
        Insert: {
          city_id: string
          created_at?: string
          description?: string | null
          event_type: string
          event_value?: number
          id?: string
          occurred_at?: string
          repository_id?: string | null
          title: string
        }
        Update: {
          city_id?: string
          created_at?: string
          description?: string | null
          event_type?: string
          event_value?: number
          id?: string
          occurred_at?: string
          repository_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "builder_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_events_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "builder_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_challenges: {
        Row: {
          created_at: string
          day: string
          description: string
          id: string
          reward_points: number
          target: number
          title: string
        }
        Insert: {
          created_at?: string
          day?: string
          description: string
          id?: string
          reward_points?: number
          target?: number
          title: string
        }
        Update: {
          created_at?: string
          day?: string
          description?: string
          id?: string
          reward_points?: number
          target?: number
          title?: string
        }
        Relationships: []
      }
      ecosystem_projects: {
        Row: {
          builder_id: string
          category: string
          created_at: string
          id: string
          is_featured: boolean
          name: string
          package_count: number
          repository_id: string
          reputation_score: number
          slug: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          builder_id: string
          category: string
          created_at?: string
          id?: string
          is_featured?: boolean
          name: string
          package_count?: number
          repository_id: string
          reputation_score?: number
          slug: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          builder_id?: string
          category?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          name?: string
          package_count?: number
          repository_id?: string
          reputation_score?: number
          slug?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecosystem_projects_builder_id_fkey"
            columns: ["builder_id"]
            isOneToOne: false
            referencedRelation: "builders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_projects_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: true
            referencedRelation: "builder_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_claim_links: {
        Row: {
          amount_sui: number
          claimed_at: string | null
          claimed_wallet: string | null
          created_at: string
          created_by: string | null
          id: string
          launch_symbol: string
          status: string
          token: string
          updated_at: string
          x_username: string
        }
        Insert: {
          amount_sui?: number
          claimed_at?: string | null
          claimed_wallet?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          launch_symbol: string
          status?: string
          token: string
          updated_at?: string
          x_username: string
        }
        Update: {
          amount_sui?: number
          claimed_at?: string | null
          claimed_wallet?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          launch_symbol?: string
          status?: string
          token?: string
          updated_at?: string
          x_username?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          clicks: number
          created_at: string
          duration_ms: number
          game_key: string
          id: string
          max_combo: number
          payment_id: string | null
          score: number
          season_id: string | null
          user_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          duration_ms?: number
          game_key?: string
          id?: string
          max_combo?: number
          payment_id?: string | null
          score: number
          season_id?: string | null
          user_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          duration_ms?: number
          game_key?: string
          id?: string
          max_combo?: number
          payment_id?: string | null
          score?: number
          season_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sui_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_reserve: {
        Row: {
          address: string
          contributed_sui: number
          created_at: string
          id: boolean
          secret_ciphertext: string
          updated_at: string
        }
        Insert: {
          address: string
          contributed_sui?: number
          created_at?: string
          id?: boolean
          secret_ciphertext: string
          updated_at?: string
        }
        Update: {
          address?: string
          contributed_sui?: number
          created_at?: string
          id?: boolean
          secret_ciphertext?: string
          updated_at?: string
        }
        Relationships: []
      }
      gas_reserve_contributions: {
        Row: {
          amount_sui: number
          created_at: string
          id: string
          reference: string | null
          source: string
        }
        Insert: {
          amount_sui: number
          created_at?: string
          id?: string
          reference?: string | null
          source: string
        }
        Update: {
          amount_sui?: number
          created_at?: string
          id?: string
          reference?: string | null
          source?: string
        }
        Relationships: []
      }
      launch_fee_payouts: {
        Row: {
          created_at: string
          destination_wallet: string | null
          destination_x_username: string | null
          id: string
          launch_symbol: string
          launchpad: string
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_wallet?: string | null
          destination_x_username?: string | null
          id?: string
          launch_symbol: string
          launchpad: string
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_wallet?: string | null
          destination_x_username?: string | null
          id?: string
          launch_symbol?: string
          launchpad?: string
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meme_battles: {
        Row: {
          created_at: string
          day: string
          id: string
          meme_a: string
          meme_b: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          day?: string
          id?: string
          meme_a: string
          meme_b: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          meme_a?: string
          meme_b?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meme_battles_meme_a_fkey"
            columns: ["meme_a"]
            isOneToOne: false
            referencedRelation: "memes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meme_battles_meme_b_fkey"
            columns: ["meme_b"]
            isOneToOne: false
            referencedRelation: "memes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meme_battles_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "memes"
            referencedColumns: ["id"]
          },
        ]
      }
      meme_votes: {
        Row: {
          battle_id: string
          created_at: string
          id: string
          meme_id: string
          user_id: string
        }
        Insert: {
          battle_id: string
          created_at?: string
          id?: string
          meme_id: string
          user_id: string
        }
        Update: {
          battle_id?: string
          created_at?: string
          id?: string
          meme_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meme_votes_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "meme_battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meme_votes_meme_id_fkey"
            columns: ["meme_id"]
            isOneToOne: false
            referencedRelation: "memes"
            referencedColumns: ["id"]
          },
        ]
      }
      memes: {
        Row: {
          created_at: string
          id: string
          image_url: string
          reviewed_by: string | null
          status: Database["public"]["Enums"]["meme_status"]
          title: string
          user_id: string
          wins: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["meme_status"]
          title: string
          user_id: string
          wins?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["meme_status"]
          title?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          reason: string | null
          target_ref: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          reason?: string | null
          target_ref?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          target_ref?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      points_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          dedupe_key: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_provider: string
          avatar_seed: string
          avatar_url: string | null
          best_score: number
          created_at: string
          display_name: string | null
          games_played: number
          id: string
          is_banned: boolean
          last_login_day: string | null
          muted_until: string | null
          nickname: string | null
          points: number
          social_id: string | null
          streak: number
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          auth_provider?: string
          avatar_seed?: string
          avatar_url?: string | null
          best_score?: number
          created_at?: string
          display_name?: string | null
          games_played?: number
          id: string
          is_banned?: boolean
          last_login_day?: string | null
          muted_until?: string | null
          nickname?: string | null
          points?: number
          social_id?: string | null
          streak?: number
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          auth_provider?: string
          avatar_seed?: string
          avatar_url?: string | null
          best_score?: number
          created_at?: string
          display_name?: string | null
          games_played?: number
          id?: string
          is_banned?: boolean
          last_login_day?: string | null
          muted_until?: string | null
          nickname?: string | null
          points?: number
          social_id?: string | null
          streak?: number
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      repository_signals: {
        Row: {
          created_at: string
          evidence: string | null
          id: string
          label: string
          points: number
          repository_id: string
          signal_key: string
          strength: string
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          id?: string
          label: string
          points?: number
          repository_id: string
          signal_key: string
          strength: string
        }
        Update: {
          created_at?: string
          evidence?: string | null
          id?: string
          label?: string
          points?: number
          repository_id?: string
          signal_key?: string
          strength?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_signals_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "builder_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          is_current: boolean
          name: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
        }
        Relationships: []
      }
      sui_payments: {
        Row: {
          amount_mist: number
          consumed_at: string | null
          created_at: string
          digest: string
          id: string
          purpose: string
          recipient: string
          sender: string
          user_id: string
        }
        Insert: {
          amount_mist: number
          consumed_at?: string | null
          created_at?: string
          digest: string
          id?: string
          purpose: string
          recipient: string
          sender: string
          user_id: string
        }
        Update: {
          amount_mist?: number
          consumed_at?: string | null
          created_at?: string
          digest?: string
          id?: string
          purpose?: string
          recipient?: string
          sender?: string
          user_id?: string
        }
        Relationships: []
      }
      terminal_history: {
        Row: {
          command: string
          created_at: string
          id: string
          intent: string
          response: string
          result: Json
          status: string
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          id?: string
          intent: string
          response: string
          result?: Json
          status?: string
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          id?: string
          intent?: string
          response?: string
          result?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      x_accounts: {
        Row: {
          access_token_ciphertext: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          expires_at: string | null
          refresh_token_ciphertext: string | null
          updated_at: string
          user_id: string
          username: string
          x_user_id: string
        }
        Insert: {
          access_token_ciphertext: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          refresh_token_ciphertext?: string | null
          updated_at?: string
          user_id: string
          username: string
          x_user_id: string
        }
        Update: {
          access_token_ciphertext?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          refresh_token_ciphertext?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          x_user_id?: string
        }
        Relationships: []
      }
      x_bot_state: {
        Row: {
          bot_user_id: string | null
          id: boolean
          last_mention_id: string | null
          updated_at: string
        }
        Insert: {
          bot_user_id?: string | null
          id?: boolean
          last_mention_id?: string | null
          updated_at?: string
        }
        Update: {
          bot_user_id?: string | null
          id?: boolean
          last_mention_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      x_mentions: {
        Row: {
          created_at: string
          id: string
          intent: string
          post_error: string | null
          posted: boolean
          posted_at: string | null
          reply_post_id: string | null
          reply_text: string
          result: Json
          source: string
          status: string
          text: string
          x_post_id: string
          x_username: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent: string
          post_error?: string | null
          posted?: boolean
          posted_at?: string | null
          reply_post_id?: string | null
          reply_text: string
          result?: Json
          source?: string
          status: string
          text: string
          x_post_id: string
          x_username: string
        }
        Update: {
          created_at?: string
          id?: string
          intent?: string
          post_error?: string | null
          posted?: boolean
          posted_at?: string | null
          reply_post_id?: string | null
          reply_text?: string
          result?: Json
          source?: string
          status?: string
          text?: string
          x_post_id?: string
          x_username?: string
        }
        Relationships: []
      }
      x_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          purpose: string
          redirect_uri: string
          state: string
          user_id: string | null
        }
        Insert: {
          code_verifier: string
          created_at?: string
          purpose?: string
          redirect_uri: string
          state: string
          user_id?: string | null
        }
        Update: {
          code_verifier?: string
          created_at?: string
          purpose?: string
          redirect_uri?: string
          state?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_points: {
        Args: {
          _actor_id?: string
          _amount: number
          _dedupe_key?: string
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      run_x_poll: { Args: never; Returns: undefined }
      set_x_poll_secret: { Args: { p_secret: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "player"
      meme_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "player"],
      meme_status: ["pending", "approved", "rejected"],
    },
  },
} as const
