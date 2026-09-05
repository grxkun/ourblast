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
          reply_to: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          reply_to?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
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
      game_sessions: {
        Row: {
          clicks: number
          created_at: string
          duration_ms: number
          game_key: string
          id: string
          max_combo: number
          score: number
          user_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          duration_ms?: number
          game_key?: string
          id?: string
          max_combo?: number
          score: number
          user_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          duration_ms?: number
          game_key?: string
          id?: string
          max_combo?: number
          score?: number
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
          avatar_seed: string
          best_score: number
          created_at: string
          games_played: number
          id: string
          is_banned: boolean
          last_login_day: string | null
          muted_until: string | null
          nickname: string | null
          points: number
          streak: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          avatar_seed?: string
          best_score?: number
          created_at?: string
          games_played?: number
          id: string
          is_banned?: boolean
          last_login_day?: string | null
          muted_until?: string | null
          nickname?: string | null
          points?: number
          streak?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          avatar_seed?: string
          best_score?: number
          created_at?: string
          games_played?: number
          id?: string
          is_banned?: boolean
          last_login_day?: string | null
          muted_until?: string | null
          nickname?: string | null
          points?: number
          streak?: number
          updated_at?: string
          wallet_address?: string
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
