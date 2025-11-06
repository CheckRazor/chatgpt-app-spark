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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      batch_operations: {
        Row: {
          client_ref: string | null
          created_at: string
          created_by: string
          event_id: string | null
          id: string
          metadata: Json | null
          operation_type: string
          rolled_back_at: string | null
          rolled_back_by: string | null
          status: string
        }
        Insert: {
          client_ref?: string | null
          created_at?: string
          created_by: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          operation_type: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          status?: string
        }
        Update: {
          client_ref?: string | null
          created_at?: string
          created_by?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          operation_type?: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_operations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_totals: {
        Row: {
          created_at: string
          created_by: string
          distributed_amount: number
          event_id: string
          id: string
          medal_id: string
          min_score_for_raffle: number | null
          raffle_amount_used: number | null
          remaining_amount_distributed: number | null
          total_amount: number
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          distributed_amount?: number
          event_id: string
          id?: string
          medal_id: string
          min_score_for_raffle?: number | null
          raffle_amount_used?: number | null
          remaining_amount_distributed?: number | null
          total_amount: number
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          distributed_amount?: number
          event_id?: string
          id?: string
          medal_id?: string
          min_score_for_raffle?: number | null
          raffle_amount_used?: number | null
          remaining_amount_distributed?: number | null
          total_amount?: number
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_totals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_totals_medal_id_fkey"
            columns: ["medal_id"]
            isOneToOne: false
            referencedRelation: "medals"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          event_date: string
          id: string
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          event_date: string
          id?: string
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          event_date?: string
          id?: string
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ledger_transactions: {
        Row: {
          amount: number
          batch_operation_id: string | null
          created_at: string
          created_by: string
          description: string | null
          event_id: string | null
          id: string
          medal_id: string
          player_id: string
          raffle_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          batch_operation_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          event_id?: string | null
          id?: string
          medal_id: string
          player_id: string
          raffle_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          batch_operation_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          event_id?: string | null
          id?: string
          medal_id?: string
          player_id?: string
          raffle_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_batch_operation_id_fkey"
            columns: ["batch_operation_id"]
            isOneToOne: false
            referencedRelation: "batch_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_medal_id_fkey"
            columns: ["medal_id"]
            isOneToOne: false
            referencedRelation: "medals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      medals: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          updated_at: string
          value: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          value: number
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      ocr_rows: {
        Row: {
          confidence: number | null
          corrected_value: number | null
          created_at: string | null
          event_id: string
          id: string
          image_source: string | null
          is_verified: boolean | null
          linked_player_id: string | null
          parsed_name: string
          parsed_score: number
          parsed_score_big: number | null
          raw_score_text: string | null
          raw_text: string | null
          updated_at: string | null
          upload_id: string | null
        }
        Insert: {
          confidence?: number | null
          corrected_value?: number | null
          created_at?: string | null
          event_id: string
          id?: string
          image_source?: string | null
          is_verified?: boolean | null
          linked_player_id?: string | null
          parsed_name: string
          parsed_score: number
          parsed_score_big?: number | null
          raw_score_text?: string | null
          raw_text?: string | null
          updated_at?: string | null
          upload_id?: string | null
        }
        Update: {
          confidence?: number | null
          corrected_value?: number | null
          created_at?: string | null
          event_id?: string
          id?: string
          image_source?: string | null
          is_verified?: boolean | null
          linked_player_id?: string | null
          parsed_name?: string
          parsed_score?: number
          parsed_score_big?: number | null
          raw_score_text?: string | null
          raw_text?: string | null
          updated_at?: string | null
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_rows_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_rows_linked_player_id_fkey"
            columns: ["linked_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_rows_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "ocr_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_uploads: {
        Row: {
          created_at: string
          event_id: string
          id: string
          original_text: string | null
          processed_data: Json | null
          status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          original_text?: string | null
          processed_data?: Json | null
          status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          original_text?: string | null
          processed_data?: Json | null
          status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_uploads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          aliases: string[] | null
          canonical_name: string
          created_at: string
          deleted_at: string | null
          id: string
          is_alt: boolean
          joined_at: string
          main_player_id: string | null
          status: Database["public"]["Enums"]["player_status"]
          updated_at: string
        }
        Insert: {
          aliases?: string[] | null
          canonical_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_alt?: boolean
          joined_at?: string
          main_player_id?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
        }
        Update: {
          aliases?: string[] | null
          canonical_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_alt?: boolean
          joined_at?: string
          main_player_id?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_main_player_id_fkey"
            columns: ["main_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      raffle_entries: {
        Row: {
          batch_operation_id: string | null
          created_at: string
          id: string
          is_winner: boolean
          player_id: string
          prize_amount: number | null
          raffle_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          batch_operation_id?: string | null
          created_at?: string
          id?: string
          is_winner?: boolean
          player_id: string
          prize_amount?: number | null
          raffle_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          batch_operation_id?: string | null
          created_at?: string
          id?: string
          is_winner?: boolean
          player_id?: string
          prize_amount?: number | null
          raffle_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "raffle_entries_batch_operation_id_fkey"
            columns: ["batch_operation_id"]
            isOneToOne: false
            referencedRelation: "batch_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_entries_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_entries_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          entries_after: number
          entries_before: number
          event_id: string
          id: string
          player_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          entries_after: number
          entries_before: number
          event_id: string
          id?: string
          player_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          entries_after?: number
          entries_before?: number
          event_id?: string
          id?: string
          player_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raffle_entries_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_entries_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_weights: {
        Row: {
          entries_before: number | null
          entries_next: number | null
          event_id: string
          id: string
          last_updated: string | null
          player_id: string
          updated_by: string | null
        }
        Insert: {
          entries_before?: number | null
          entries_next?: number | null
          event_id: string
          id?: string
          last_updated?: string | null
          player_id: string
          updated_by?: string | null
        }
        Update: {
          entries_before?: number | null
          entries_next?: number | null
          event_id?: string
          id?: string
          last_updated?: string | null
          player_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raffle_weights_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_weights_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      raffles: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          drawn_at: string | null
          event_id: string
          id: string
          medal_id: string
          name: string
          status: string
          total_prizes: number
          updated_at: string
          weight_formula: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          drawn_at?: string | null
          event_id: string
          id?: string
          medal_id: string
          name: string
          status?: string
          total_prizes: number
          updated_at?: string
          weight_formula?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          drawn_at?: string | null
          event_id?: string
          id?: string
          medal_id?: string
          name?: string
          status?: string
          total_prizes?: number
          updated_at?: string
          weight_formula?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_medal_id_fkey"
            columns: ["medal_id"]
            isOneToOne: false
            referencedRelation: "medals"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string
          created_by: string
          event_id: string
          id: string
          notes: string | null
          player_id: string
          rank: number | null
          raw_score: number | null
          score: number
          updated_at: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id: string
          id?: string
          notes?: string | null
          player_id: string
          rank?: number | null
          raw_score?: number | null
          score: number
          updated_at?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          notes?: string | null
          player_id?: string
          rank?: number | null
          raw_score?: number | null
          score?: number
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "scores_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      run_weighted_distribution_v1: {
        Args: { actor: string; event_uuid: string; medal_uuid: string }
        Returns: Json
      }
      run_weighted_distribution_v2: {
        Args: { actor: string; event_uuid: string; medal_uuid: string }
        Returns: Json
      }
      upsert_scores_big_v2: { Args: { payload: Json }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "leader" | "viewer"
      player_status: "active" | "inactive"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "leader", "viewer"],
      player_status: ["active", "inactive"],
    },
  },
} as const
