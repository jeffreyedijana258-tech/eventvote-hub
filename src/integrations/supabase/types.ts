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
      candidates: {
        Row: {
          bio: string | null
          created_at: string
          event_id: string
          id: string
          image_url: string | null
          name: string
          position: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          event_id: string
          id?: string
          image_url?: string | null
          name: string
          position?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          event_id?: string
          id?: string
          image_url?: string | null
          name?: string
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          max_votes_per_user: number
          organizer_id: string
          rejection_reason: string | null
          results_public: boolean
          slug: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          voting_enabled: boolean
          voting_ends_at: string | null
          voting_starts_at: string | null
        }
        Insert: {
          category?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          max_votes_per_user?: number
          organizer_id: string
          rejection_reason?: string | null
          results_public?: boolean
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          voting_enabled?: boolean
          voting_ends_at?: string | null
          voting_starts_at?: string | null
        }
        Update: {
          category?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          max_votes_per_user?: number
          organizer_id?: string
          rejection_reason?: string | null
          results_public?: boolean
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          voting_enabled?: boolean
          voting_ends_at?: string | null
          voting_starts_at?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          commission_amount: number
          created_at: string
          id: string
          order_id: string | null
          provider: string
          raw_response: Json | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          user_id: string | null
        }
        Insert: {
          amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          provider?: string
          raw_response?: Json | null
          reference: string
          status?: Database["public"]["Enums"]["payment_status"]
          user_id?: string | null
        }
        Update: {
          amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          provider?: string
          raw_response?: Json | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ticket_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          event_id: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          event_id?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          event_id?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_orders: {
        Row: {
          commission_amount: number
          created_at: string
          event_id: string
          gross_amount: number
          id: string
          organizer_amount: number
          quantity: number
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          ticket_type_id: string
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          event_id: string
          gross_amount?: number
          id?: string
          organizer_amount?: number
          quantity?: number
          reference: string
          status?: Database["public"]["Enums"]["payment_status"]
          ticket_type_id: string
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          event_id?: string
          gross_amount?: number
          id?: string
          organizer_amount?: number
          quantity?: number
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          ticket_type_id?: string
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          quantity_sold: number
          quantity_total: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          quantity_sold?: number
          quantity_total?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          quantity_sold?: number
          quantity_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_used: boolean
          order_id: string
          ticket_code: string
          ticket_type_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_used?: boolean
          order_id: string
          ticket_code: string
          ticket_type_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_used?: boolean
          order_id?: string
          ticket_code?: string
          ticket_type_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ticket_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
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
      votes: {
        Row: {
          candidate_id: string
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      event_is_public: { Args: { _event_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_event: { Args: { _event_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "user" | "organizer" | "admin"
      event_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      payment_status: "pending" | "success" | "failed"
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
      app_role: ["user", "organizer", "admin"],
      event_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
      ],
      payment_status: ["pending", "success", "failed"],
    },
  },
} as const
