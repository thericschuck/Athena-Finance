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
      account_balances: {
        Row: {
          account_id: string
          balance: number
          created_at: string
          currency: string
          id: string
          snapshot_date: string
          source: string
        }
        Insert: {
          account_id: string
          balance: number
          created_at?: string
          currency: string
          id?: string
          snapshot_date: string
          source?: string
        }
        Update: {
          account_id?: string
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          snapshot_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          bank_iban: string | null
          color: string | null
          created_at: string
          currency: string
          iban: string | null
          id: string
          institution: string | null
          is_active: boolean
          name: string
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_iban?: string | null
          color?: string | null
          created_at?: string
          currency: string
          iban?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_iban?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          pinned: boolean
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge: {
        Row: {
          content: string
          content_tsv: unknown
          created_at: string
          id: string
          pinned: boolean
          source: string
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          content_tsv?: unknown
          created_at?: string
          id?: string
          pinned?: boolean
          source?: string
          source_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          content_tsv?: unknown
          created_at?: string
          id?: string
          pinned?: boolean
          source?: string
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          event: string
          id: string
          level: string
          message: string | null
          meta: Json | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          event: string
          id?: string
          level?: string
          message?: string | null
          meta?: Json | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          event?: string
          id?: string
          level?: string
          message?: string | null
          meta?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          category: string
          confidence: number
          content: string
          content_tsv: unknown
          created_at: string
          id: string
          key: string
          last_used_at: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          confidence?: number
          content: string
          content_tsv?: unknown
          created_at?: string
          id?: string
          key: string
          last_used_at?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          id?: string
          key?: string
          last_used_at?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: Json
          content_text: string | null
          content_tsv: unknown
          conversation_id: string
          created_at: string
          duration_ms: number | null
          finish_reason: string | null
          id: string
          model: string | null
          role: string
          tool_calls: Json | null
          usage: Json | null
          user_id: string
        }
        Insert: {
          content: Json
          content_text?: string | null
          content_tsv?: unknown
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          finish_reason?: string | null
          id?: string
          model?: string | null
          role: string
          tool_calls?: Json | null
          usage?: Json | null
          user_id: string
        }
        Update: {
          content?: Json
          content_text?: string | null
          content_tsv?: unknown
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          finish_reason?: string | null
          id?: string
          model?: string | null
          role?: string
          tool_calls?: Json | null
          usage?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          action: string
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          input: Json
          message_id: string | null
          resolved_at: string | null
          result: Json | null
          status: string
          summary: string
          user_id: string
        }
        Insert: {
          action: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input: Json
          message_id?: string | null
          resolved_at?: string | null
          result?: Json | null
          status?: string
          summary: string
          user_id: string
        }
        Update: {
          action?: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          message_id?: string | null
          resolved_at?: string | null
          result?: Json | null
          status?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          auto_memory: boolean
          custom_instructions: string | null
          daily_message_cap: number
          effort: string
          max_steps: number
          memory_enabled: boolean
          model: string
          persona: string
          persona_text: string | null
          updated_at: string
          user_id: string
          web_research: boolean
        }
        Insert: {
          auto_memory?: boolean
          custom_instructions?: string | null
          daily_message_cap?: number
          effort?: string
          max_steps?: number
          memory_enabled?: boolean
          model?: string
          persona?: string
          persona_text?: string | null
          updated_at?: string
          user_id: string
          web_research?: boolean
        }
        Update: {
          auto_memory?: boolean
          custom_instructions?: string | null
          daily_message_cap?: number
          effort?: string
          max_steps?: number
          memory_enabled?: boolean
          model?: string
          persona?: string
          persona_text?: string | null
          updated_at?: string
          user_id?: string
          web_research?: boolean
        }
        Relationships: []
      }
      ai_tool_calls: {
        Row: {
          conversation_id: string
          created_at: string
          duration_ms: number | null
          id: string
          input: Json | null
          is_error: boolean
          message_id: string
          output_summary: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          is_error?: boolean
          message_id: string
          output_summary?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          is_error?: boolean
          message_id?: string
          output_summary?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_audit_log: {
        Row: {
          action: string
          asset_id: string | null
          asset_name: string
          asset_symbol: string
          changes: Json | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          asset_id?: string | null
          asset_name: string
          asset_symbol: string
          changes?: Json | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          asset_id?: string | null
          asset_name?: string
          asset_symbol?: string
          changes?: Json | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_audit_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_valuations: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          price_per_unit: number
          source: string
          total_value: number
          valuation_date: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          price_per_unit: number
          source?: string
          total_value: number
          valuation_date: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          price_per_unit?: number
          source?: string
          total_value?: number
          valuation_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          account_id: string | null
          avg_buy_price: number | null
          created_at: string
          currency: string
          exchange: string | null
          id: string
          name: string
          notes: string | null
          portfolio_name: string | null
          quantity: number | null
          source: string
          symbol: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          avg_buy_price?: number | null
          created_at?: string
          currency: string
          exchange?: string | null
          id?: string
          name: string
          notes?: string | null
          portfolio_name?: string | null
          quantity?: number | null
          source?: string
          symbol?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          avg_buy_price?: number | null
          created_at?: string
          currency?: string
          exchange?: string | null
          id?: string
          name?: string
          notes?: string | null
          portfolio_name?: string | null
          quantity?: number | null
          source?: string
          symbol?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_balance: {
        Row: {
          account_bic: string | null
          account_iban: string
          account_name: string | null
          available_balance: number
          bank_label: string | null
          booked_balance: number
          created_at: string
          currency: string
          fetched_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_bic?: string | null
          account_iban: string
          account_name?: string | null
          available_balance?: number
          bank_label?: string | null
          booked_balance?: number
          created_at?: string
          currency?: string
          fetched_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_bic?: string | null
          account_iban?: string
          account_name?: string | null
          available_balance?: number
          bank_label?: string | null
          booked_balance?: number
          created_at?: string
          currency?: string
          fetched_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_bic: string | null
          account_iban: string
          amount: number
          bank_label: string | null
          bank_reference: string | null
          category: string | null
          category_id: string | null
          ai_category_id: string | null
          category_source: string | null
          counterpart_bic: string | null
          counterpart_iban: string | null
          counterpart_name: string | null
          created_at: string
          currency: string
          description: string | null
          entry_date: string | null
          external_id: string | null
          id: string
          raw_description: string | null
          user_id: string
          value_date: string
        }
        Insert: {
          account_bic?: string | null
          account_iban: string
          amount: number
          bank_label?: string | null
          bank_reference?: string | null
          category?: string | null
          category_id?: string | null
          ai_category_id?: string | null
          category_source?: string | null
          counterpart_bic?: string | null
          counterpart_iban?: string | null
          counterpart_name?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entry_date?: string | null
          external_id?: string | null
          id?: string
          raw_description?: string | null
          user_id: string
          value_date: string
        }
        Update: {
          account_bic?: string | null
          account_iban?: string
          amount?: number
          bank_label?: string | null
          bank_reference?: string | null
          category?: string | null
          category_id?: string | null
          ai_category_id?: string | null
          category_source?: string | null
          counterpart_bic?: string | null
          counterpart_iban?: string | null
          counterpart_name?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entry_date?: string | null
          external_id?: string | null
          id?: string
          raw_description?: string | null
          user_id?: string
          value_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      belege: {
        Row: {
          aussteller: string | null
          beleg_datum: string | null
          betrag: number | null
          dateiname: string
          ersetzt_durch: string | null
          groesse_bytes: number | null
          hochgeladen_am: string
          id: string
          mime: string | null
          notiz: string | null
          pfad: string
          sha256: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          aussteller?: string | null
          beleg_datum?: string | null
          betrag?: number | null
          dateiname: string
          ersetzt_durch?: string | null
          groesse_bytes?: number | null
          hochgeladen_am?: string
          id?: string
          mime?: string | null
          notiz?: string | null
          pfad: string
          sha256?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          aussteller?: string | null
          beleg_datum?: string | null
          betrag?: number | null
          dateiname?: string
          ersetzt_durch?: string | null
          groesse_bytes?: number | null
          hochgeladen_am?: string
          id?: string
          mime?: string | null
          notiz?: string | null
          pfad?: string
          sha256?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "belege_ersetzt_durch_fkey"
            columns: ["ersetzt_durch"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          monthly_budget: number | null
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          monthly_budget?: number | null
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          monthly_budget?: number | null
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          interval_days: number
          name: string
          notes: string | null
          quantity: number
          unit_price: number
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          interval_days: number
          name: string
          notes?: string | null
          quantity?: number
          unit_price: number
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          interval_days?: number
          name?: string
          notes?: string | null
          quantity?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          budget_monthly: number | null
          business_share: number | null
          color: string | null
          euer_zeile: number | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          tax_role: string | null
          type: string
          user_id: string
        }
        Insert: {
          budget_monthly?: number | null
          business_share?: number | null
          color?: string | null
          euer_zeile?: number | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          tax_role?: string | null
          type: string
          user_id: string
        }
        Update: {
          budget_monthly?: number | null
          business_share?: number | null
          color?: string | null
          euer_zeile?: number | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          tax_role?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_indicators: {
        Row: {
          combo_id: string
          id: string
          indicator_id: string
          role: string
          settings_override: string | null
          sort_order: number
        }
        Insert: {
          combo_id: string
          id?: string
          indicator_id: string
          role: string
          settings_override?: string | null
          sort_order?: number
        }
        Update: {
          combo_id?: string
          id?: string
          indicator_id?: string
          role?: string
          settings_override?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_indicators_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_indicators_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          asset: string
          asset_class: string
          created_at: string
          guard_failures: string[] | null
          id: string
          indicator_count: number | null
          long_condition: string | null
          name: string
          notes: string | null
          passes_guard: boolean | null
          short_condition: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: string
          asset_class: string
          created_at?: string
          guard_failures?: string[] | null
          id?: string
          indicator_count?: number | null
          long_condition?: string | null
          name: string
          notes?: string | null
          passes_guard?: boolean | null
          short_condition?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          asset_class?: string
          created_at?: string
          guard_failures?: string[] | null
          id?: string
          indicator_count?: number | null
          long_condition?: string | null
          name?: string
          notes?: string | null
          passes_guard?: boolean | null
          short_condition?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_executions: {
        Row: {
          contract_id: string
          created_at: string
          execution_date: string
          id: string
          transaction_id: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          execution_date: string
          id?: string
          transaction_id?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          execution_date?: string
          id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_executions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          account_id: string | null
          amount: number
          auto_renews: boolean
          billing_day: number | null
          category_id: string | null
          created_at: string
          currency: string
          document_url: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          notice_days: number
          provider: string | null
          start_date: string
          to_account_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          auto_renews?: boolean
          billing_day?: number | null
          category_id?: string | null
          created_at?: string
          currency: string
          document_url?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          notice_days?: number
          provider?: string | null
          start_date: string
          to_account_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          auto_renews?: boolean
          billing_day?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          document_url?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          notice_days?: number
          provider?: string | null
          start_date?: string
          to_account_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_price_cache: {
        Row: {
          price_eur: number
          symbol: string
          updated_at: string
        }
        Insert: {
          price_eur?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          price_eur?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string
          debt_id: string
          id: string
          interest: number | null
          notes: string | null
          payment_date: string
          principal: number | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string
          debt_id: string
          id?: string
          interest?: number | null
          notes?: string | null
          payment_date: string
          principal?: number | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string
          debt_id?: string
          id?: string
          interest?: number | null
          notes?: string | null
          payment_date?: string
          principal?: number | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          created_at: string
          creditor: string | null
          currency: string
          due_date: string | null
          id: string
          interest_rate: number | null
          is_active: boolean
          monthly_payment: number | null
          name: string
          notes: string | null
          original_amount: number
          outstanding: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          creditor?: string | null
          currency: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          is_active?: boolean
          monthly_payment?: number | null
          name: string
          notes?: string | null
          original_amount: number
          outstanding: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          creditor?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          is_active?: boolean
          monthly_payment?: number | null
          name?: string
          notes?: string | null
          original_amount?: number
          outstanding?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      depot_holdings: {
        Row: {
          account_label: string | null
          account_number: string | null
          acquisition_price: number | null
          bank_label: string | null
          created_at: string
          currency: string
          external_id: string
          fetched_at: string
          id: string
          isin: string
          market_value: number | null
          name: string | null
          pieces: number | null
          total_value: number | null
          user_id: string
          valuation_date: string | null
        }
        Insert: {
          account_label?: string | null
          account_number?: string | null
          acquisition_price?: number | null
          bank_label?: string | null
          created_at?: string
          currency?: string
          external_id: string
          fetched_at?: string
          id?: string
          isin: string
          market_value?: number | null
          name?: string | null
          pieces?: number | null
          total_value?: number | null
          user_id: string
          valuation_date?: string | null
        }
        Update: {
          account_label?: string | null
          account_number?: string | null
          acquisition_price?: number | null
          bank_label?: string | null
          created_at?: string
          currency?: string
          external_id?: string
          fetched_at?: string
          id?: string
          isin?: string
          market_value?: number | null
          name?: string | null
          pieces?: number | null
          total_value?: number | null
          user_id?: string
          valuation_date?: string | null
        }
        Relationships: []
      }
      depot_transactions: {
        Row: {
          amount_eur: number
          created_at: string
          fund_name: string
          id: string
          isin: string
          notes: string | null
          price_per_share: number
          shares: number | null
          transaction_date: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          created_at?: string
          fund_name: string
          id?: string
          isin: string
          notes?: string | null
          price_per_share: number
          shares?: number | null
          transaction_date: string
          transaction_type?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          created_at?: string
          fund_name?: string
          id?: string
          isin?: string
          notes?: string | null
          price_per_share?: number
          shares?: number | null
          transaction_date?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      depots: {
        Row: {
          created_at: string
          id: string
          isin: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          isin: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          isin?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      euer_zeilen: {
        Row: {
          art: string
          bezeichnung: string
          geprueft_am: string
          jahr: number
          quelle: string
          sammelzeile: boolean
          zeile: number
        }
        Insert: {
          art: string
          bezeichnung: string
          geprueft_am: string
          jahr: number
          quelle: string
          sammelzeile?: boolean
          zeile: number
        }
        Update: {
          art?: string
          bezeichnung?: string
          geprueft_am?: string
          jahr?: number
          quelle?: string
          sammelzeile?: boolean
          zeile?: number
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          api_key: string | null
          api_secret: string | null
          created_at: string
          exchange: string
          id: string
          is_active: boolean
          is_testnet: boolean
          label: string
          last_sync_at: string | null
          permissions: string[] | null
          user_id: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          exchange: string
          id?: string
          is_active?: boolean
          is_testnet?: boolean
          label: string
          last_sync_at?: string | null
          permissions?: string[] | null
          user_id: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          exchange?: string
          id?: string
          is_active?: boolean
          is_testnet?: boolean
          label?: string
          last_sync_at?: string | null
          permissions?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      exchange_keys: {
        Row: {
          api_key: string
          api_secret: string
          created_at: string
          exchange: string
          id: string
          user_id: string
        }
        Insert: {
          api_key: string
          api_secret: string
          created_at?: string
          exchange: string
          id?: string
          user_id: string
        }
        Update: {
          api_key?: string
          api_secret?: string
          created_at?: string
          exchange?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      fints_client_state: {
        Row: {
          bank_key: string
          bank_label: string | null
          last_sca_at: string | null
          sca_required_since: string | null
          state_blob: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_key: string
          bank_label?: string | null
          last_sca_at?: string | null
          sca_required_since?: string | null
          state_blob: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_key?: string
          bank_label?: string | null
          last_sca_at?: string | null
          sca_required_since?: string | null
          state_blob?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fund_price_cache: {
        Row: {
          currency: string
          fetched_at: string
          fund_name: string
          isin: string
          price: number
        }
        Insert: {
          currency?: string
          fetched_at?: string
          fund_name: string
          isin: string
          price: number
        }
        Update: {
          currency?: string
          fetched_at?: string
          fund_name?: string
          isin?: string
          price?: number
        }
        Relationships: []
      }
      fund_price_history: {
        Row: {
          created_at: string
          currency: string
          isin: string
          price: number
          price_date: string
        }
        Insert: {
          created_at?: string
          currency?: string
          isin: string
          price: number
          price_date: string
        }
        Update: {
          created_at?: string
          currency?: string
          isin?: string
          price?: number
          price_date?: string
        }
        Relationships: []
      }
      fund_prices: {
        Row: {
          created_at: string
          currency: string
          fund_name: string
          id: string
          isin: string
          price: number
          price_date: string
        }
        Insert: {
          created_at?: string
          currency?: string
          fund_name: string
          id?: string
          isin: string
          price: number
          price_date: string
        }
        Update: {
          created_at?: string
          currency?: string
          fund_name?: string
          id?: string
          isin?: string
          price?: number
          price_date?: string
        }
        Relationships: []
      }
      fund_sources: {
        Row: {
          created_at: string
          currency: string
          isin: string
          name: string
          ticker: string | null
          url: string
          xpath: string
        }
        Insert: {
          created_at?: string
          currency?: string
          isin: string
          name: string
          ticker?: string | null
          url: string
          xpath: string
        }
        Update: {
          created_at?: string
          currency?: string
          isin?: string
          name?: string
          ticker?: string | null
          url?: string
          xpath?: string
        }
        Relationships: []
      }
      income_targets: {
        Row: {
          buffer_pct: number
          created_at: string
          id: string
          label: string
          savings_pct: number
          tax_pct: number
          user_id: string
        }
        Insert: {
          buffer_pct?: number
          created_at?: string
          id?: string
          label?: string
          savings_pct?: number
          tax_pct?: number
          user_id: string
        }
        Update: {
          buffer_pct?: number
          created_at?: string
          id?: string
          label?: string
          savings_pct?: number
          tax_pct?: number
          user_id?: string
        }
        Relationships: []
      }
      indicator_performance: {
        Row: {
          asset: string
          asset_class: string
          cobra_green: number | null
          cobra_red: number | null
          created_at: string
          equity_max_dd: number | null
          id: string
          indicator_id: string
          intra_trade_dd: number | null
          net_profit_pct: number | null
          omega_ratio: number | null
          profit_factor: number | null
          settings: string | null
          sharpe: number | null
          sortino: number | null
          test_end: string | null
          test_start: string | null
          timeframe: string
          trades: number | null
          win_rate: number | null
        }
        Insert: {
          asset: string
          asset_class: string
          cobra_green?: number | null
          cobra_red?: number | null
          created_at?: string
          equity_max_dd?: number | null
          id?: string
          indicator_id: string
          intra_trade_dd?: number | null
          net_profit_pct?: number | null
          omega_ratio?: number | null
          profit_factor?: number | null
          settings?: string | null
          sharpe?: number | null
          sortino?: number | null
          test_end?: string | null
          test_start?: string | null
          timeframe: string
          trades?: number | null
          win_rate?: number | null
        }
        Update: {
          asset?: string
          asset_class?: string
          cobra_green?: number | null
          cobra_red?: number | null
          created_at?: string
          equity_max_dd?: number | null
          id?: string
          indicator_id?: string
          intra_trade_dd?: number | null
          net_profit_pct?: number | null
          omega_ratio?: number | null
          profit_factor?: number | null
          settings?: string | null
          sharpe?: number | null
          sortino?: number | null
          test_end?: string | null
          test_start?: string | null
          timeframe?: string
          trades?: number | null
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicator_performance_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      indicators: {
        Row: {
          author: string
          code: string | null
          created_at: string
          forbidden_reason: string | null
          id: string
          is_forbidden: boolean
          name: string
          notes: string | null
          repaints: boolean
          subtype: string | null
          tv_url: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          code?: string | null
          created_at?: string
          forbidden_reason?: string | null
          id?: string
          is_forbidden?: boolean
          name: string
          notes?: string | null
          repaints?: boolean
          subtype?: string | null
          tv_url?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          code?: string | null
          created_at?: string
          forbidden_reason?: string | null
          id?: string
          is_forbidden?: boolean
          name?: string
          notes?: string | null
          repaints?: boolean
          subtype?: string | null
          tv_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      insights: {
        Row: {
          body: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          payload: Json | null
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          payload?: Json | null
          severity?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          payload?: Json | null
          severity?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      kraken_order_log: {
        Row: {
          cost_eur: number | null
          created_at: string
          error: string | null
          fee_eur: number | null
          filled_volume: number | null
          id: string
          kraken_order_id: string | null
          kraken_pair: string
          leg_group: string
          order_type: string
          pending_action_id: string | null
          price_eur: number | null
          requested_volume: number
          side: string
          status: string
          user_id: string
        }
        Insert: {
          cost_eur?: number | null
          created_at?: string
          error?: string | null
          fee_eur?: number | null
          filled_volume?: number | null
          id?: string
          kraken_order_id?: string | null
          kraken_pair: string
          leg_group: string
          order_type?: string
          pending_action_id?: string | null
          price_eur?: number | null
          requested_volume: number
          side: string
          status: string
          user_id: string
        }
        Update: {
          cost_eur?: number | null
          created_at?: string
          error?: string | null
          fee_eur?: number | null
          filled_volume?: number | null
          id?: string
          kraken_order_id?: string | null
          kraken_pair?: string
          leg_group?: string
          order_type?: string
          pending_action_id?: string | null
          price_eur?: number | null
          requested_volume?: number
          side?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kraken_order_log_pending_action_id_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "ai_pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      kraken_trades: {
        Row: {
          base: string
          cost: number
          created_at: string
          eur_kurs: number | null
          eur_kurs_geschaetzt: boolean
          fee: number
          id: string
          pair: string
          price: number
          quote: string
          side: string
          traded_at: string
          txid: string
          user_id: string
          vol: number
        }
        Insert: {
          base: string
          cost: number
          created_at?: string
          eur_kurs?: number | null
          eur_kurs_geschaetzt?: boolean
          fee?: number
          id?: string
          pair: string
          price: number
          quote: string
          side: string
          traded_at: string
          txid: string
          user_id: string
          vol: number
        }
        Update: {
          base?: string
          cost?: number
          created_at?: string
          eur_kurs?: number | null
          eur_kurs_geschaetzt?: boolean
          fee?: number
          id?: string
          pair?: string
          price?: number
          quote?: string
          side?: string
          traded_at?: string
          txid?: string
          user_id?: string
          vol?: number
        }
        Relationships: []
      }
      kraken_ledger: {
        Row: {
          amount: number
          asset: string
          created_at: string
          fee: number
          id: string
          ledger_id: string
          occurred_at: string
          refid: string | null
          subtype: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          created_at?: string
          fee?: number
          id?: string
          ledger_id: string
          occurred_at: string
          refid?: string | null
          subtype?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          created_at?: string
          fee?: number
          id?: string
          ledger_id?: string
          occurred_at?: string
          refid?: string | null
          subtype?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_finance_summary: {
        Row: {
          created_at: string
          food: number
          id: string
          leisure: number
          month: string
          net_balance: number
          other_expenses: number
          other_income: number
          pocket_money: number
          salary: number
          savings_transfer: number
          source: string
          subscriptions: number
          total_expenses: number
          total_income: number
          user_id: string
        }
        Insert: {
          created_at?: string
          food?: number
          id?: string
          leisure?: number
          month: string
          net_balance?: number
          other_expenses?: number
          other_income?: number
          pocket_money?: number
          salary?: number
          savings_transfer?: number
          source?: string
          subscriptions?: number
          total_expenses?: number
          total_income?: number
          user_id: string
        }
        Update: {
          created_at?: string
          food?: number
          id?: string
          leisure?: number
          month?: string
          net_balance?: number
          other_expenses?: number
          other_income?: number
          pocket_money?: number
          salary?: number
          savings_transfer?: number
          source?: string
          subscriptions?: number
          total_expenses?: number
          total_income?: number
          user_id?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          created_at: string
          id: string
          net_worth: number | null
          snapshot_date: string
          source: string
          total_assets: number | null
          total_bausparer: number
          total_business: number
          total_cash: number
          total_checking: number
          total_crypto: number
          total_debts: number
          total_depot: number
          total_investment: number
          total_savings: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          net_worth?: number | null
          snapshot_date: string
          source?: string
          total_assets?: number | null
          total_bausparer?: number
          total_business?: number
          total_cash?: number
          total_checking?: number
          total_crypto?: number
          total_debts?: number
          total_depot?: number
          total_investment?: number
          total_savings?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          net_worth?: number | null
          snapshot_date?: string
          source?: string
          total_assets?: number | null
          total_bausparer?: number
          total_business?: number
          total_cash?: number
          total_checking?: number
          total_crypto?: number
          total_debts?: number
          total_depot?: number
          total_investment?: number
          total_savings?: number
          user_id?: string
        }
        Relationships: []
      }
      net_worth_snapshots_backup_20260830: {
        Row: {
          created_at: string | null
          id: string | null
          net_worth: number | null
          snapshot_date: string | null
          source: string | null
          total_assets: number | null
          total_bausparer: number | null
          total_business: number | null
          total_cash: number | null
          total_checking: number | null
          total_crypto: number | null
          total_debts: number | null
          total_depot: number | null
          total_savings: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          net_worth?: number | null
          snapshot_date?: string | null
          source?: string | null
          total_assets?: number | null
          total_bausparer?: number | null
          total_business?: number | null
          total_cash?: number | null
          total_checking?: number | null
          total_crypto?: number | null
          total_debts?: number | null
          total_depot?: number | null
          total_savings?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          net_worth?: number | null
          snapshot_date?: string | null
          source?: string | null
          total_assets?: number | null
          total_bausparer?: number | null
          total_business?: number | null
          total_cash?: number | null
          total_checking?: number | null
          total_crypto?: number | null
          total_debts?: number | null
          total_depot?: number | null
          total_savings?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          portfolio_name: string | null
          price_eur: number
          quantity: number
          snapshot_date: string
          source: string
          user_id: string
          value_eur: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          portfolio_name?: string | null
          price_eur: number
          quantity: number
          snapshot_date: string
          source?: string
          user_id: string
          value_eur?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          portfolio_name?: string | null
          price_eur?: number
          quantity?: number
          snapshot_date?: string
          source?: string
          user_id?: string
          value_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          closed_at: string | null
          created_at: string
          direction: string
          entry_price: number
          exchange_id: string
          exit_price: number | null
          fees_paid: number
          id: string
          leverage: number
          notes: string | null
          opened_at: string
          pair_id: string
          quantity: number
          realized_pnl: number | null
          source: string
          status: string
          strategy_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          direction: string
          entry_price: number
          exchange_id: string
          exit_price?: number | null
          fees_paid?: number
          id?: string
          leverage?: number
          notes?: string | null
          opened_at: string
          pair_id: string
          quantity: number
          realized_pnl?: number | null
          source?: string
          status: string
          strategy_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          direction?: string
          entry_price?: number
          exchange_id?: string
          exit_price?: number | null
          fees_paid?: number
          id?: string
          leverage?: number
          notes?: string | null
          opened_at?: string
          pair_id?: string
          quantity?: number
          realized_pnl?: number | null
          source?: string
          status?: string
          strategy_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchange_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "trading_pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          data: Json
          generated_at: string
          html: string
          id: string
          pdf_path: string | null
          period_end: string
          period_start: string
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          generated_at?: string
          html: string
          id?: string
          pdf_path?: string | null
          period_end: string
          period_start: string
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          generated_at?: string
          html?: string
          id?: string
          pdf_path?: string | null
          period_end?: string
          period_start?: string
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      robustness_tests: {
        Row: {
          created_at: string
          fail_count: number | null
          id: string
          notes: string | null
          pass_count: number | null
          sheet_url: string | null
          status: string
          strategy_id: string
          test_type: string
          tested_at: string | null
          total_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fail_count?: number | null
          id?: string
          notes?: string | null
          pass_count?: number | null
          sheet_url?: string | null
          status?: string
          strategy_id: string
          test_type: string
          tested_at?: string | null
          total_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fail_count?: number | null
          id?: string
          notes?: string | null
          pass_count?: number | null
          sheet_url?: string | null
          status?: string
          strategy_id?: string
          test_type?: string
          tested_at?: string | null
          total_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "robustness_tests_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "robustness_tests_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robustness_tests_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      roc_positions: {
        Row: {
          approach: string
          asset: string
          created_at: string
          id: string
          position_date: string
          return_pct: number | null
          user_id: string
        }
        Insert: {
          approach: string
          asset: string
          created_at?: string
          id?: string
          position_date: string
          return_pct?: number | null
          user_id: string
        }
        Update: {
          approach?: string
          asset?: string
          created_at?: string
          id?: string
          position_date?: string
          return_pct?: number | null
          user_id?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          created_at: string
          current_amount: number
          description: string
          id: string
          monthly_savings_rate: number | null
          notes: string | null
          priority: string | null
          savings_rate_start_date: string | null
          status: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          description: string
          id?: string
          monthly_savings_rate?: number | null
          notes?: string | null
          priority?: string | null
          savings_rate_start_date?: string | null
          status?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          description?: string
          id?: string
          monthly_savings_rate?: number | null
          notes?: string | null
          priority?: string | null
          savings_rate_start_date?: string | null
          status?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      savings_plans: {
        Row: {
          created_at: string
          execution_day: number
          fund_name: string
          id: string
          is_active: boolean
          isin: string
          monthly_amount: number
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          execution_day: number
          fund_name: string
          id?: string
          is_active?: boolean
          isin: string
          monthly_amount: number
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          execution_day?: number
          fund_name?: string
          id?: string
          is_active?: boolean
          isin?: string
          monthly_amount?: number
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          asset: string
          asset_class: string
          combo_id: string | null
          created_at: string
          id: string
          initial_capital: number
          name: string
          notes: string | null
          pine_version: number
          process_on_close: boolean
          status: string
          submission_date: string | null
          timeframe: string
          tv_script_url: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          asset: string
          asset_class: string
          combo_id?: string | null
          created_at?: string
          id?: string
          initial_capital?: number
          name: string
          notes?: string | null
          pine_version?: number
          process_on_close?: boolean
          status?: string
          submission_date?: string | null
          timeframe: string
          tv_script_url?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          asset?: string
          asset_class?: string
          combo_id?: string | null
          created_at?: string
          id?: string
          initial_capital?: number
          name?: string
          notes?: string | null
          pine_version?: number
          process_on_close?: boolean
          status?: string
          submission_date?: string | null
          timeframe?: string
          tv_script_url?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_strategies_combo"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_equity_snapshots: {
        Row: {
          cobra_green: number | null
          created_at: string
          equity_value: number
          exchange: string | null
          id: string
          max_dd_at_date: number | null
          net_profit_pct: number | null
          notes: string | null
          snapshot_date: string
          source: string
          strategy_id: string
        }
        Insert: {
          cobra_green?: number | null
          created_at?: string
          equity_value: number
          exchange?: string | null
          id?: string
          max_dd_at_date?: number | null
          net_profit_pct?: number | null
          notes?: string | null
          snapshot_date: string
          source?: string
          strategy_id: string
        }
        Update: {
          cobra_green?: number | null
          created_at?: string
          equity_value?: number
          exchange?: string | null
          id?: string
          max_dd_at_date?: number | null
          net_profit_pct?: number | null
          notes?: string | null
          snapshot_date?: string
          source?: string
          strategy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_equity_snapshots_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "strategy_equity_snapshots_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_equity_snapshots_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_performance: {
        Row: {
          cobra_green: number | null
          cobra_pass: boolean | null
          cobra_red: number | null
          created_at: string
          equity_max_dd: number | null
          exchange: string | null
          id: string
          intra_trade_dd: number | null
          net_profit_pct: number | null
          omega_ratio: number | null
          profit_factor: number | null
          screenshot_url: string | null
          sharpe: number | null
          sortino: number | null
          strategy_id: string
          test_end: string | null
          test_start: string
          trades: number | null
          win_rate: number | null
        }
        Insert: {
          cobra_green?: number | null
          cobra_pass?: boolean | null
          cobra_red?: number | null
          created_at?: string
          equity_max_dd?: number | null
          exchange?: string | null
          id?: string
          intra_trade_dd?: number | null
          net_profit_pct?: number | null
          omega_ratio?: number | null
          profit_factor?: number | null
          screenshot_url?: string | null
          sharpe?: number | null
          sortino?: number | null
          strategy_id: string
          test_end?: string | null
          test_start?: string
          trades?: number | null
          win_rate?: number | null
        }
        Update: {
          cobra_green?: number | null
          cobra_pass?: boolean | null
          cobra_red?: number | null
          created_at?: string
          equity_max_dd?: number | null
          exchange?: string | null
          id?: string
          intra_trade_dd?: number | null
          net_profit_pct?: number | null
          omega_ratio?: number | null
          profit_factor?: number | null
          screenshot_url?: string | null
          sharpe?: number | null
          sortino?: number | null
          strategy_id?: string
          test_end?: string | null
          test_start?: string
          trades?: number | null
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_performance_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "strategy_performance_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_performance_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_checklist: {
        Row: {
          equity_screenshot: boolean
          id: string
          indicator_desc: boolean
          inputs_screenshot: boolean
          repaint_tested: boolean
          robustness_sheet: boolean
          stats_screenshot: boolean
          strategy_id: string
          tv_script_url: boolean
          updated_at: string
        }
        Insert: {
          equity_screenshot?: boolean
          id?: string
          indicator_desc?: boolean
          inputs_screenshot?: boolean
          repaint_tested?: boolean
          robustness_sheet?: boolean
          stats_screenshot?: boolean
          strategy_id: string
          tv_script_url?: boolean
          updated_at?: string
        }
        Update: {
          equity_screenshot?: boolean
          id?: string
          indicator_desc?: boolean
          inputs_screenshot?: boolean
          repaint_tested?: boolean
          robustness_sheet?: boolean
          stats_screenshot?: boolean
          strategy_id?: string
          tv_script_url?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_checklist_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: true
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "submission_checklist_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: true
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_checklist_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: true
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_tariffs: {
        Row: {
          geprueft_am: string
          grundfreibetrag: number
          jahr: number
          kleinunternehmer_laufend: number
          kleinunternehmer_vorjahr: number
          quelle: string
          soli_freigrenze: number | null
          sonderausgabenpauschale: number
          werbungskostenpauschale: number
          zone2_bis: number
          zone2_faktor: number
          zone2_konstante: number
          zone3_bis: number
          zone3_faktor: number
          zone3_konstante: number
          zone3_sockel: number
          zone4_abzug: number
          zone4_bis: number
          zone4_satz: number
          zone5_abzug: number
          zone5_satz: number
        }
        Insert: {
          geprueft_am: string
          grundfreibetrag: number
          jahr: number
          kleinunternehmer_laufend: number
          kleinunternehmer_vorjahr: number
          quelle: string
          soli_freigrenze?: number | null
          sonderausgabenpauschale: number
          werbungskostenpauschale: number
          zone2_bis: number
          zone2_faktor: number
          zone2_konstante: number
          zone3_bis: number
          zone3_faktor: number
          zone3_konstante: number
          zone3_sockel: number
          zone4_abzug: number
          zone4_bis: number
          zone4_satz: number
          zone5_abzug: number
          zone5_satz: number
        }
        Update: {
          geprueft_am?: string
          grundfreibetrag?: number
          jahr?: number
          kleinunternehmer_laufend?: number
          kleinunternehmer_vorjahr?: number
          quelle?: string
          soli_freigrenze?: number | null
          sonderausgabenpauschale?: number
          werbungskostenpauschale?: number
          zone2_bis?: number
          zone2_faktor?: number
          zone2_konstante?: number
          zone3_bis?: number
          zone3_faktor?: number
          zone3_konstante?: number
          zone3_sockel?: number
          zone4_abzug?: number
          zone4_bis?: number
          zone4_satz?: number
          zone5_abzug?: number
          zone5_satz?: number
        }
        Relationships: []
      }
      tpi_daily_scores: {
        Row: {
          avg_score: number
          created_at: string
          id: string
          indicator_count: number
          signal: string
          snapshot_date: string
          source: string
          tpi_type: string
          user_id: string
        }
        Insert: {
          avg_score: number
          created_at?: string
          id?: string
          indicator_count: number
          signal?: string
          snapshot_date: string
          source?: string
          tpi_type: string
          user_id: string
        }
        Update: {
          avg_score?: number
          created_at?: string
          id?: string
          indicator_count?: number
          signal?: string
          snapshot_date?: string
          source?: string
          tpi_type?: string
          user_id?: string
        }
        Relationships: []
      }
      tpi_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          indicator_id: string
          notes: string | null
          score: number
          signal: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          indicator_id: string
          notes?: string | null
          score: number
          signal: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          indicator_id?: string
          notes?: string | null
          score?: number
          signal?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpi_entries_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "tpi_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      tpi_indicators: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          settings: string | null
          sort_order: number
          source_url: string | null
          tpi_type: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          settings?: string | null
          sort_order?: number
          source_url?: string | null
          tpi_type: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          settings?: string | null
          sort_order?: number
          source_url?: string | null
          tpi_type?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_fills: {
        Row: {
          exchange_order_id: string | null
          fee: number
          fee_currency: string
          filled_at: string
          id: string
          position_id: string
          price: number
          quantity: number
          side: string
          source: string
        }
        Insert: {
          exchange_order_id?: string | null
          fee?: number
          fee_currency: string
          filled_at: string
          id?: string
          position_id: string
          price: number
          quantity: number
          side: string
          source: string
        }
        Update: {
          exchange_order_id?: string | null
          fee?: number
          fee_currency?: string
          filled_at?: string
          id?: string
          position_id?: string
          price?: number
          quantity?: number
          side?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_fills_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "open_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_fills_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_pairs: {
        Row: {
          asset_class: string | null
          base_asset: string
          exchange: string | null
          id: string
          lot_size: number | null
          quote_asset: string
          symbol: string
          tick_size: number | null
        }
        Insert: {
          asset_class?: string | null
          base_asset: string
          exchange?: string | null
          id?: string
          lot_size?: number | null
          quote_asset: string
          symbol: string
          tick_size?: number | null
        }
        Update: {
          asset_class?: string | null
          base_asset?: string
          exchange?: string | null
          id?: string
          lot_size?: number | null
          quote_asset?: string
          symbol?: string
          tick_size?: number | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          amount_base: number | null
          category_id: string | null
          contract_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_rate: number
          id: string
          is_recurring: boolean
          merchant: string | null
          receipt_url: string | null
          tags: string[]
          transfer_to: string | null
          type: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          amount_base?: number | null
          category_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency: string
          date: string
          description?: string | null
          fx_rate?: number
          id?: string
          is_recurring?: boolean
          merchant?: string | null
          receipt_url?: string | null
          tags?: string[]
          transfer_to?: string | null
          type: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          amount_base?: number | null
          category_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          fx_rate?: number
          id?: string
          is_recurring?: boolean
          merchant?: string | null
          receipt_url?: string | null
          tags?: string[]
          transfer_to?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_fkey"
            columns: ["transfer_to"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency: string
          display_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json | null
        }
        Relationships: []
      }
      valuable_images: {
        Row: {
          art: string
          basis_bild_id: string | null
          created_at: string
          hinweis: string | null
          id: string
          ist_hauptbild: boolean
          pfad: string
          prompt: string | null
          sort_order: number
          user_id: string
          valuable_id: string
        }
        Insert: {
          art?: string
          basis_bild_id?: string | null
          created_at?: string
          hinweis?: string | null
          id?: string
          ist_hauptbild?: boolean
          pfad: string
          prompt?: string | null
          sort_order?: number
          user_id: string
          valuable_id: string
        }
        Update: {
          art?: string
          basis_bild_id?: string | null
          created_at?: string
          hinweis?: string | null
          id?: string
          ist_hauptbild?: boolean
          pfad?: string
          prompt?: string | null
          sort_order?: number
          user_id?: string
          valuable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuable_images_basis_bild_id_fkey"
            columns: ["basis_bild_id"]
            isOneToOne: false
            referencedRelation: "valuable_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuable_images_valuable_id_fkey"
            columns: ["valuable_id"]
            isOneToOne: false
            referencedRelation: "valuables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuable_images_valuable_id_fkey"
            columns: ["valuable_id"]
            isOneToOne: false
            referencedRelation: "valuables_current"
            referencedColumns: ["id"]
          },
        ]
      }
      valuable_valuations: {
        Row: {
          bewertet_am: string
          created_at: string
          id: string
          notiz: string | null
          quelle: string
          user_id: string
          valuable_id: string
          wert: number
        }
        Insert: {
          bewertet_am?: string
          created_at?: string
          id?: string
          notiz?: string | null
          quelle?: string
          user_id: string
          valuable_id: string
          wert: number
        }
        Update: {
          bewertet_am?: string
          created_at?: string
          id?: string
          notiz?: string | null
          quelle?: string
          user_id?: string
          valuable_id?: string
          wert?: number
        }
        Relationships: [
          {
            foreignKeyName: "valuable_valuations_valuable_id_fkey"
            columns: ["valuable_id"]
            isOneToOne: false
            referencedRelation: "valuables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuable_valuations_valuable_id_fkey"
            columns: ["valuable_id"]
            isOneToOne: false
            referencedRelation: "valuables_current"
            referencedColumns: ["id"]
          },
        ]
      }
      valuables: {
        Row: {
          box_vorhanden: boolean
          created_at: string
          gekauft_am: string | null
          id: string
          im_vermoegen: boolean
          is_active: boolean
          kategorie: string
          kaufpreis: number | null
          kaufquelle: string | null
          lagerort: string | null
          marke: string | null
          modell: string | null
          name: string
          notizen: string | null
          papiere_vorhanden: boolean
          referenz: string | null
          seriennummer: string | null
          sort_order: number
          updated_at: string
          user_id: string
          verkaufspreis: number | null
          verkauft_am: string | null
          versichert: boolean
          versicherungsnummer: string | null
          waehrung: string
          zustand: string | null
        }
        Insert: {
          box_vorhanden?: boolean
          created_at?: string
          gekauft_am?: string | null
          id?: string
          im_vermoegen?: boolean
          is_active?: boolean
          kategorie?: string
          kaufpreis?: number | null
          kaufquelle?: string | null
          lagerort?: string | null
          marke?: string | null
          modell?: string | null
          name: string
          notizen?: string | null
          papiere_vorhanden?: boolean
          referenz?: string | null
          seriennummer?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
          verkaufspreis?: number | null
          verkauft_am?: string | null
          versichert?: boolean
          versicherungsnummer?: string | null
          waehrung?: string
          zustand?: string | null
        }
        Update: {
          box_vorhanden?: boolean
          created_at?: string
          gekauft_am?: string | null
          id?: string
          im_vermoegen?: boolean
          is_active?: boolean
          kategorie?: string
          kaufpreis?: number | null
          kaufquelle?: string | null
          lagerort?: string | null
          marke?: string | null
          modell?: string | null
          name?: string
          notizen?: string | null
          papiere_vorhanden?: boolean
          referenz?: string | null
          seriennummer?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
          verkaufspreis?: number | null
          verkauft_am?: string | null
          versichert?: boolean
          versicherungsnummer?: string | null
          waehrung?: string
          zustand?: string | null
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          consent: boolean
          created_at: string
          email: string
          id: string
        }
        Insert: {
          consent: boolean
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          consent?: boolean
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          action: string | null
          error: string | null
          id: string
          position_id: string | null
          price: number | null
          processed: boolean
          raw_payload: Json
          received_at: string
          strategy_id: string | null
          symbol: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          error?: string | null
          id?: string
          position_id?: string | null
          price?: number | null
          processed?: boolean
          raw_payload: Json
          received_at?: string
          strategy_id?: string | null
          symbol?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          error?: string | null
          id?: string
          position_id?: string | null
          price?: number | null
          processed?: boolean
          raw_payload?: Json
          received_at?: string
          strategy_id?: string | null
          symbol?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "open_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "webhook_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balance_sums_manual: {
        Row: {
          account_id: string | null
          balance: number | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      account_balance_sums_unified: {
        Row: {
          account_id: string | null
          balance: number | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      asset_valuations_latest: {
        Row: {
          asset_id: string | null
          price_per_unit: number | null
          total_value: number | null
          valuation_date: string | null
        }
        Relationships: []
      }
      category_tree: {
        Row: {
          depth: number | null
          euer_zeile_effective: number | null
          id: string | null
          name: string | null
          parent_id: string | null
          path: string | null
          root_id: string | null
          root_name: string | null
          tax_role_effective: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      current_net_worth: {
        Row: {
          net_worth: number | null
          snapshot_date: string | null
          total_assets: number | null
          total_crypto: number | null
          total_debts: number | null
          total_depot: number | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_flow_totals: {
        Row: {
          anlage_expense: number | null
          anlage_income: number | null
          echt_expense: number | null
          echt_income: number | null
          expense: number | null
          forderung_expense: number | null
          forderung_income: number | null
          income: number | null
          month: string | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_flows: {
        Row: {
          account_id: string | null
          category_id: string | null
          category_name: string | null
          expense: number | null
          flow_kind: string | null
          income: number | null
          month: string | null
          root_category_id: string | null
          root_category_name: string | null
          source: string | null
          tax_role_effective: string | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      open_positions: {
        Row: {
          base_asset: string | null
          closed_at: string | null
          created_at: string | null
          direction: string | null
          entry_price: number | null
          exchange_id: string | null
          exit_price: number | null
          fees_paid: number | null
          id: string | null
          leverage: number | null
          notes: string | null
          opened_at: string | null
          pair_id: string | null
          quantity: number | null
          realized_pnl: number | null
          source: string | null
          status: string | null
          strategy_id: string | null
          strategy_name: string | null
          symbol: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchange_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "trading_pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "robustness_status"
            referencedColumns: ["strategy_id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "submission_ready"
            referencedColumns: ["id"]
          },
        ]
      }
      robustness_status: {
        Row: {
          all_tests_pass: boolean | null
          exchange_test: string | null
          name: string | null
          parameter_test: string | null
          strategy_id: string | null
          timeframe_test: string | null
        }
        Relationships: []
      }
      submission_ready: {
        Row: {
          asset: string | null
          id: string | null
          name: string | null
          status: string | null
          timeframe: string | null
        }
        Relationships: []
      }
      unified_transactions: {
        Row: {
          account_color: string | null
          account_id: string | null
          account_name: string | null
          amount: number | null
          amount_base: number | null
          amount_eur: number | null
          booked_date: string | null
          category_color: string | null
          category_id: string | null
          category_name: string | null
          category_path: string | null
          category_type: string | null
          contract_id: string | null
          counts_in_flow: boolean | null
          currency: string | null
          date: string | null
          description: string | null
          description_raw: string | null
          euer_zeile_effective: number | null
          flow_kind: string | null
          fx_rate: number | null
          id: string | null
          merchant: string | null
          root_category_id: string | null
          root_category_name: string | null
          signed_amount: number | null
          source: string | null
          tags: string[] | null
          tax_role_effective: string | null
          transfer_to: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      valuables_current: {
        Row: {
          aktueller_wert: number | null
          bild_anzahl: number | null
          box_vorhanden: boolean | null
          created_at: string | null
          foto_anzahl: number | null
          gekauft_am: string | null
          hauptbild_pfad: string | null
          id: string | null
          im_vermoegen: boolean | null
          is_active: boolean | null
          kategorie: string | null
          kaufpreis: number | null
          kaufquelle: string | null
          lagerort: string | null
          marke: string | null
          modell: string | null
          name: string | null
          notizen: string | null
          papiere_vorhanden: boolean | null
          referenz: string | null
          rendite_prozent: number | null
          seriennummer: string | null
          sort_order: number | null
          updated_at: string | null
          user_id: string | null
          verkaufspreis: number | null
          verkauft_am: string | null
          versichert: boolean | null
          versicherungsnummer: string | null
          waehrung: string | null
          wert_quelle: string | null
          wert_stand: string | null
          zustand: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_combo_guard: { Args: { p_combo_id: string }; Returns: undefined }
      fn_asset_price_eur: {
        Args: {
          p_asset_id: string
          p_avg: number
          p_date: string
          p_symbol: string
          p_type: string
        }
        Returns: number
      }
      fn_clean_bank_description: {
        Args: { p_fallback: string; p_text: string }
        Returns: string
      }
      fn_ensure_linked_account: {
        Args: {
          p_account_name: string
          p_booked_balance: number
          p_currency: string
          p_iban: string
          p_user_id: string
        }
        Returns: string
      }
      fn_fund_price_eur: {
        Args: { p_date: string; p_isin: string }
        Returns: number
      }
      fn_recompute_account_balances: {
        Args: { p_date: string; p_uid: string }
        Returns: number
      }
      fn_recompute_monthly_summary: {
        Args: { p_month: string; p_uid: string }
        Returns: undefined
      }
      fn_take_snapshot: { Args: { target_date?: string }; Returns: Json }
      fn_valuables_total: {
        Args: { p_date: string; p_uid: string }
        Returns: number
      }
      search_ai_knowledge: {
        Args: { max_results?: number; q: string }
        Returns: {
          content: string
          id: string
          rank: number
          source_url: string
          tags: string[]
          title: string
        }[]
      }
      search_ai_memories: {
        Args: { max_results?: number; q: string }
        Returns: {
          category: string
          content: string
          id: string
          key: string
          rank: number
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
    Enums: {},
  },
} as const
