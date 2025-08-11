export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      bundles: {
        Row: {
          bundle_name: string
          bundle_price: number | null
          bundle_type: string | null
          created_at: string | null
          id: string
          total_items: number | null
          user_id: string | null
        }
        Insert: {
          bundle_name: string
          bundle_price?: number | null
          bundle_type?: string | null
          created_at?: string | null
          id?: string
          total_items?: number | null
          user_id?: string | null
        }
        Update: {
          bundle_name?: string
          bundle_price?: number | null
          bundle_type?: string | null
          created_at?: string | null
          id?: string
          total_items?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_exports: {
        Row: {
          created_at: string | null
          download_url: string | null
          expires_at: string | null
          file_name: string
          id: string
          item_count: number
          storage_path: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          file_name: string
          id?: string
          item_count: number
          storage_path?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          file_name?: string
          id?: string
          item_count?: number
          storage_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csv_exports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: number
          item_id: number | null
          ocr_text: string | null
          parsed_json: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: number
          item_id?: number | null
          ocr_text?: string | null
          parsed_json?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: number
          item_id?: number | null
          ocr_text?: string | null
          parsed_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "extractions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          all_visible_text: string | null
          author: string | null
          bundle_id: string | null
          condition_assessment: string | null
          confidence_score: number | null
          created_at: string | null
          description: string | null
          ebay_category_id: number | null
          edition: string | null
          edition_info: string | null
          extracted_text: Json | null
          format: string | null
          genre: string | null
          id: string
          is_bundle_parent: boolean | null
          isbn: string | null
          issue_date: string | null
          issue_number: string | null
          listed_at: string | null
          model_used: string | null
          ocr_quality: string | null
          photo_id: string | null
          processed_at: string | null
          publication_year: number | null
          publisher: string | null
          series_title: string | null
          sold_at: string | null
          status: string | null
          subtitle: string | null
          suggested_category: string | null
          suggested_price: number | null
          suggested_title: string | null
          title: string | null
          topic: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          all_visible_text?: string | null
          author?: string | null
          bundle_id?: string | null
          condition_assessment?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          ebay_category_id?: number | null
          edition?: string | null
          edition_info?: string | null
          extracted_text?: Json | null
          format?: string | null
          genre?: string | null
          id?: string
          is_bundle_parent?: boolean | null
          isbn?: string | null
          issue_date?: string | null
          issue_number?: string | null
          listed_at?: string | null
          model_used?: string | null
          ocr_quality?: string | null
          photo_id?: string | null
          processed_at?: string | null
          publication_year?: number | null
          publisher?: string | null
          series_title?: string | null
          sold_at?: string | null
          status?: string | null
          subtitle?: string | null
          suggested_category?: string | null
          suggested_price?: number | null
          suggested_title?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          all_visible_text?: string | null
          author?: string | null
          bundle_id?: string | null
          condition_assessment?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          ebay_category_id?: number | null
          edition?: string | null
          edition_info?: string | null
          extracted_text?: Json | null
          format?: string | null
          genre?: string | null
          id?: string
          is_bundle_parent?: boolean | null
          isbn?: string | null
          issue_date?: string | null
          issue_number?: string | null
          listed_at?: string | null
          model_used?: string | null
          ocr_quality?: string | null
          photo_id?: string | null
          processed_at?: string | null
          publication_year?: number | null
          publisher?: string | null
          series_title?: string | null
          sold_at?: string | null
          status?: string | null
          subtitle?: string | null
          suggested_category?: string | null
          suggested_price?: number | null
          suggested_title?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_bundle_id"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          authors: Json | null
          categories: Json | null
          cover_url_ext: string | null
          created_at: string | null
          description: string | null
          id: number
          isbn10: string | null
          isbn13: string | null
          last_scanned_at: string | null
          publisher: string | null
          quantity: number | null
          source: string | null
          status: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
          year: string | null
        }
        Insert: {
          authors?: Json | null
          categories?: Json | null
          cover_url_ext?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          isbn10?: string | null
          isbn13?: string | null
          last_scanned_at?: string | null
          publisher?: string | null
          quantity?: number | null
          source?: string | null
          status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          year?: string | null
        }
        Update: {
          authors?: Json | null
          categories?: Json | null
          cover_url_ext?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          isbn10?: string | null
          isbn13?: string | null
          last_scanned_at?: string | null
          publisher?: string | null
          quantity?: number | null
          source?: string | null
          status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          year?: string | null
        }
        Relationships: []
      }
      listing_queues: {
        Row: {
          created_at: string | null
          id: string
          item_id: string | null
          priority_score: number | null
          queue_date: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          priority_score?: number | null
          queue_date: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          priority_score?: number | null
          queue_date?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_queues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_queues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          batch_id: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          id: string
          item_id: number | null
          public_url: string | null
          storage_path: string
          thumb_url: string | null
          uploaded_at: string | null
          url_public: string | null
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          item_id?: number | null
          public_url?: string | null
          storage_path: string
          thumb_url?: string | null
          uploaded_at?: string | null
          url_public?: string | null
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          item_id?: number | null
          public_url?: string | null
          storage_path?: string
          thumb_url?: string | null
          uploaded_at?: string | null
          url_public?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "processing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_item_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_batches: {
        Row: {
          created_at: string | null
          id: string
          processed_images: number | null
          status: string | null
          total_images: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          processed_images?: number | null
          status?: string | null
          total_images: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          processed_images?: number | null
          status?: string | null
          total_images?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          custom_title_text: string | null
          email: string
          full_name: string | null
          id: string
          images_used_this_month: number | null
          monthly_image_limit: number | null
          subscription_tier: string | null
          title_prefixes: string[] | null
          title_suffixes: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_title_text?: string | null
          email: string
          full_name?: string | null
          id: string
          images_used_this_month?: number | null
          monthly_image_limit?: number | null
          subscription_tier?: string | null
          title_prefixes?: string[] | null
          title_suffixes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_title_text?: string | null
          email?: string
          full_name?: string | null
          id?: string
          images_used_this_month?: number | null
          monthly_image_limit?: number | null
          subscription_tier?: string | null
          title_prefixes?: string[] | null
          title_suffixes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_title_preferences: {
        Args: {
          user_id_param: string
          prefixes?: string[]
          suffixes?: string[]
          custom_text?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
