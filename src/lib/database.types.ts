// Generated from the hosted dev project (Supabase MCP generate_typescript_types, 2026-10-18).
// Regenerate after each migration. Do not edit by hand.
// numeric columns appear as `number` here. The app selects them as `::text` and parses them with decimal.js (R-DATA-3).

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor: string | null
          created_at: string
          data: Json
          entity: string
          entity_id: string | null
          id: string
          kind: string
          shop_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          data?: Json
          entity: string
          entity_id?: string | null
          id?: string
          kind: string
          shop_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          data?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          kind?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          shop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      document_lines: {
        Row: {
          conversion_factor: number | null
          created_at: string
          description: string | null
          discount: number | null
          document_id: string
          id: string
          line_no: number
          match_source: string | null
          part_number: string | null
          product_id: string | null
          quantity: number | null
          raw: Json | null
          received_quantity: number | null
          shop_id: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          conversion_factor?: number | null
          created_at?: string
          description?: string | null
          discount?: number | null
          document_id: string
          id?: string
          line_no: number
          match_source?: string | null
          part_number?: string | null
          product_id?: string | null
          quantity?: number | null
          raw?: Json | null
          received_quantity?: number | null
          shop_id: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          conversion_factor?: number | null
          created_at?: string
          description?: string | null
          discount?: number | null
          document_id?: string
          id?: string
          line_no?: number
          match_source?: string | null
          part_number?: string | null
          product_id?: string | null
          quantity?: number | null
          raw?: Json | null
          received_quantity?: number | null
          shop_id?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_lines_document_id_shop_id_fkey"
            columns: ["document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "document_lines_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "balance_reconciliation"
            referencedColumns: ["product_id", "shop_id"]
          },
          {
            foreignKeyName: "document_lines_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      documents: {
        Row: {
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          doc_date: string | null
          doc_number: string | null
          duplicate_override_reason: string | null
          extraction_provider: string | null
          extraction_status: string
          file_mime: string | null
          file_path: string | null
          file_sha256: string | null
          file_size: number | null
          id: string
          idempotency_key: string | null
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          raw_counterparty: string | null
          raw_doc_date: string | null
          raw_doc_number: string | null
          raw_extraction: Json | null
          raw_totals: Json | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          shop_id: string
          status: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          doc_date?: string | null
          doc_number?: string | null
          duplicate_override_reason?: string | null
          extraction_provider?: string | null
          extraction_status?: string
          file_mime?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          raw_counterparty?: string | null
          raw_doc_date?: string | null
          raw_doc_number?: string | null
          raw_extraction?: Json | null
          raw_totals?: Json | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          shop_id: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          doc_date?: string | null
          doc_number?: string | null
          duplicate_override_reason?: string | null
          extraction_provider?: string | null
          extraction_status?: string
          file_mime?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          raw_counterparty?: string | null
          raw_doc_date?: string | null
          raw_doc_number?: string | null
          raw_extraction?: Json | null
          raw_totals?: Json | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          shop_id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_counterparty_id_shop_id_fkey"
            columns: ["counterparty_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_balances: {
        Row: {
          product_id: string
          qty: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          product_id: string
          qty?: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          product_id?: string
          qty?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_balances_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "balance_reconciliation"
            referencedColumns: ["product_id", "shop_id"]
          },
          {
            foreignKeyName: "product_balances_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      products: {
        Row: {
          base_unit: string
          brand: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          part_number: string
          part_number_norm: string | null
          reorder_threshold: number
          selling_price: number
          shelf_bin: string | null
          shop_id: string
          sku: string
          updated_at: string
        }
        Insert: {
          base_unit?: string
          brand: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          part_number: string
          part_number_norm?: string | null
          reorder_threshold?: number
          selling_price?: number
          shelf_bin?: string | null
          shop_id: string
          sku: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          brand?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          part_number?: string
          part_number_norm?: string | null
          reorder_threshold?: number
          selling_price?: number
          shelf_bin?: string | null
          shop_id?: string
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_demo: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          actor: string
          created_at: string
          document_id: string | null
          document_line_id: string | null
          id: string
          product_id: string
          qty: number
          reason: string | null
          reverses_movement_id: string | null
          shop_id: string
          source: string
        }
        Insert: {
          actor: string
          created_at?: string
          document_id?: string | null
          document_line_id?: string | null
          id?: string
          product_id: string
          qty: number
          reason?: string | null
          reverses_movement_id?: string | null
          shop_id: string
          source: string
        }
        Update: {
          actor?: string
          created_at?: string
          document_id?: string | null
          document_line_id?: string | null
          id?: string
          product_id?: string
          qty?: number
          reason?: string | null
          reverses_movement_id?: string | null
          shop_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_document_id_shop_id_fkey"
            columns: ["document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "stock_movements_document_line_id_fkey"
            columns: ["document_line_id"]
            isOneToOne: false
            referencedRelation: "document_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "balance_reconciliation"
            referencedColumns: ["product_id", "shop_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_movement_id_fkey"
            columns: ["reverses_movement_id"]
            isOneToOne: true
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_aliases: {
        Row: {
          confirmed_count: number
          counterparty_id: string
          description_norm: string
          id: string
          last_confirmed_at: string
          last_confirmed_by: string | null
          part_number_norm: string | null
          product_id: string
          shop_id: string
        }
        Insert: {
          confirmed_count?: number
          counterparty_id: string
          description_norm: string
          id?: string
          last_confirmed_at?: string
          last_confirmed_by?: string | null
          part_number_norm?: string | null
          product_id: string
          shop_id: string
        }
        Update: {
          confirmed_count?: number
          counterparty_id?: string
          description_norm?: string
          id?: string
          last_confirmed_at?: string
          last_confirmed_by?: string | null
          part_number_norm?: string | null
          product_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_aliases_counterparty_id_shop_id_fkey"
            columns: ["counterparty_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "supplier_aliases_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "balance_reconciliation"
            referencedColumns: ["product_id", "shop_id"]
          },
          {
            foreignKeyName: "supplier_aliases_product_id_shop_id_fkey"
            columns: ["product_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "supplier_aliases_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      product_stock: {
        Row: {
          base_unit: string | null
          brand: string | null
          description: string | null
          has_movements: boolean | null
          id: string | null
          is_low: boolean | null
          part_number: string | null
          qty: string | null
          reorder_threshold: string | null
          selling_price: string | null
          shelf_bin: string | null
          shop_id: string | null
          sku: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      balance_reconciliation: {
        Row: {
          cached_qty: number | null
          ledger_qty: number | null
          product_id: string | null
          shop_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _audit: {
        Args: {
          p_data?: Json
          p_entity: string
          p_entity_id: string
          p_kind: string
          p_shop: string
        }
        Returns: undefined
      }
      _ledger_add: {
        Args: {
          p_actor: string
          p_document?: string
          p_line?: string
          p_product: string
          p_qty: number
          p_reason?: string
          p_reverses?: string
          p_shop: string
          p_source: string
        }
        Returns: string
      }
      document_file_access: {
        Args: { p_name: string; p_require_draft?: boolean }
        Returns: boolean
      }
      import_products: {
        Args: { p_rows: Json; p_shop_id: string }
        Returns: Json
      }
      is_member: { Args: { p_shop: string }; Returns: boolean }
      is_owner: { Args: { p_shop: string }; Returns: boolean }
      ledger_write_allowed: { Args: never; Returns: boolean }
      normalize_description: { Args: { p: string }; Returns: string }
      normalize_part_number: { Args: { p: string }; Returns: string }
      post_document: {
        Args: {
          p_document_id: string
          p_duplicate_override_reason?: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      reverse_document: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      save_draft: {
        Args: {
          p_document_id: string
          p_expected_updated_at: string
          p_header: Json
          p_lines: Json
        }
        Returns: Json
      }
      search_products: {
        Args: { p_query: string; p_shop_id: string }
        Returns: {
          base_unit: string | null
          brand: string | null
          description: string | null
          has_movements: boolean | null
          id: string | null
          is_low: boolean | null
          part_number: string | null
          qty: string | null
          reorder_threshold: string | null
          selling_price: string | null
          shelf_bin: string | null
          shop_id: string | null
          sku: string | null
          updated_at: string | null
        }[]
      }
      set_opening_quantity: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      suggest_products: {
        Args: {
          p_brand?: string
          p_counterparty_id: string
          p_description: string
          p_part_number: string
          p_shop_id: string
        }
        Returns: {
          base_unit: string
          brand: string
          confident: boolean
          description: string
          part_number: string
          product_id: string
          score: number
          sku: string
          source: string
        }[]
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
