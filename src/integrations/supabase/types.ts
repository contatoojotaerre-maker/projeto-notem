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
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_is_platform_admin: boolean
          created_at: string
          details: Json
          id: string
          organization_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_is_platform_admin?: boolean
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_is_platform_admin?: boolean
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      adn_distributions: {
        Row: {
          access_key: string | null
          cnpj: string
          created_at: string
          document_type: string | null
          environment: Database["public"]["Enums"]["environment"]
          event_type: string | null
          generated_at: string | null
          nsu: number
        }
        Insert: {
          access_key?: string | null
          cnpj: string
          created_at?: string
          document_type?: string | null
          environment: Database["public"]["Enums"]["environment"]
          event_type?: string | null
          generated_at?: string | null
          nsu: number
        }
        Update: {
          access_key?: string | null
          cnpj?: string
          created_at?: string
          document_type?: string | null
          environment?: Database["public"]["Enums"]["environment"]
          event_type?: string | null
          generated_at?: string | null
          nsu?: number
        }
        Relationships: []
      }
      adn_sync_cursors: {
        Row: {
          claim_token: string | null
          cnpj: string
          created_at: string
          documents_imported: number
          environment: Database["public"]["Enums"]["environment"]
          failures: number
          first_completed_at: string | null
          last_error: string | null
          last_error_code: string | null
          last_query_at: string | null
          last_request: Json | null
          last_success_at: string | null
          lease_until: string | null
          next_nsu: number
          next_query_at: string
          request: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          claim_token?: string | null
          cnpj: string
          created_at?: string
          documents_imported?: number
          environment: Database["public"]["Enums"]["environment"]
          failures?: number
          first_completed_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_query_at?: string | null
          last_request?: Json | null
          last_success_at?: string | null
          lease_until?: string | null
          next_nsu?: number
          next_query_at?: string
          request?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          claim_token?: string | null
          cnpj?: string
          created_at?: string
          documents_imported?: number
          environment?: Database["public"]["Enums"]["environment"]
          failures?: number
          first_completed_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_query_at?: string | null
          last_request?: Json | null
          last_success_at?: string | null
          lease_until?: string | null
          next_nsu?: number
          next_query_at?: string
          request?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_concurrency_slots: {
        Row: {
          lease_until: string
          scope: string
          slot: number
          token: string
        }
        Insert: {
          lease_until: string
          scope: string
          slot: number
          token: string
        }
        Update: {
          lease_until?: string
          scope?: string
          slot?: number
          token?: string
        }
        Relationships: []
      }
      api_idempotency_keys: {
        Row: {
          body_hash: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          expires_at: string
          integration_id: string
          key: string
          method: string
          path: string
          response_body: Json | null
          status_code: number | null
        }
        Insert: {
          body_hash: string
          created_at?: string
          environment: Database["public"]["Enums"]["environment"]
          expires_at?: string
          integration_id: string
          key: string
          method: string
          path: string
          response_body?: Json | null
          status_code?: number | null
        }
        Update: {
          body_hash?: string
          created_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          expires_at?: string
          integration_id?: string
          key?: string
          method?: string
          path?: string
          response_body?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_idempotency_keys_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_counters: {
        Row: {
          bucket: string
          hits: number
          scope: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          scope: string
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          scope?: string
          window_start?: string
        }
        Relationships: []
      }
      api_rate_limit_overrides: {
        Row: {
          bucket: string
          created_at: string
          max_hits: number
          organization_id: string
          updated_at: string
          updated_by: string | null
          window_seconds: number
        }
        Insert: {
          bucket: string
          created_at?: string
          max_hits: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          window_seconds: number
        }
        Update: {
          bucket?: string
          created_at?: string
          max_hits?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          window_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limit_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          company_id: string | null
          created_at: string
          duration_ms: number
          environment: Database["public"]["Enums"]["environment"] | null
          error_code: string | null
          id: string
          integration_id: string | null
          key_id: string | null
          method: string
          organization_id: string | null
          path: string
          request_body: Json | null
          response_body: Json | null
          status_code: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          duration_ms: number
          environment?: Database["public"]["Enums"]["environment"] | null
          error_code?: string | null
          id: string
          integration_id?: string | null
          key_id?: string | null
          method: string
          organization_id?: string | null
          path: string
          request_body?: Json | null
          response_body?: Json | null
          status_code: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          duration_ms?: number
          environment?: Database["public"]["Enums"]["environment"] | null
          error_code?: string | null
          id?: string
          integration_id?: string | null
          key_id?: string | null
          method?: string
          organization_id?: string | null
          path?: string
          request_body?: Json | null
          response_body?: Json | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "api_request_logs_key_id_integration_id_organization_id_env_fkey"
            columns: [
              "key_id",
              "integration_id",
              "organization_id",
              "environment",
            ]
            isOneToOne: false
            referencedRelation: "integration_keys"
            referencedColumns: [
              "id",
              "integration_id",
              "organization_id",
              "environment",
            ]
          },
          {
            foreignKeyName: "api_request_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_audit_events: {
        Row: {
          action: string
          company_id: string
          created_at: string
          environment: string | null
          id: string
          organization_id: string
          purpose: string
          result: string
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          environment?: string | null
          id?: string
          organization_id: string
          purpose: string
          result: string
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          environment?: string | null
          id?: string
          organization_id?: string
          purpose?: string
          result?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_audit_events_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      certificate_expiry_notices: {
        Row: {
          certificate_id: string
          created_at: string
          milestone: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          milestone: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          milestone?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_expiry_notices_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "company_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          change_origin: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id: string | null
          cnpj: string
          complement: string
          created_at: string
          created_by: string
          district: string
          email: string
          external_id: string | null
          id: string
          legal_name: string
          municipal_registration: string
          municipality_ibge_code: string
          number: string
          organization_id: string
          phone: string
          postal_code: string
          state: string
          status: Database["public"]["Enums"]["company_status"]
          street: string
          trade_name: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          active?: boolean
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          cnpj: string
          complement?: string
          created_at?: string
          created_by: string
          district?: string
          email?: string
          external_id?: string | null
          id?: string
          legal_name: string
          municipal_registration?: string
          municipality_ibge_code: string
          number?: string
          organization_id: string
          phone?: string
          postal_code?: string
          state: string
          status?: Database["public"]["Enums"]["company_status"]
          street?: string
          trade_name?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          active?: boolean
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          cnpj?: string
          complement?: string
          created_at?: string
          created_by?: string
          district?: string
          email?: string
          external_id?: string | null
          id?: string
          legal_name?: string
          municipal_registration?: string
          municipality_ibge_code?: string
          number?: string
          organization_id?: string
          phone?: string
          postal_code?: string
          state?: string
          status?: Database["public"]["Enums"]["company_status"]
          street?: string
          trade_name?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_changed_by_integration_id_fkey"
            columns: ["changed_by_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_municipality_ibge_code_fkey"
            columns: ["municipality_ibge_code"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["ibge_code"]
          },
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_certificate_material: {
        Row: {
          company_id: string
          data: string
          key_version: string
          nonce: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          data: string
          key_version: string
          nonce: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          data?: string
          key_version?: string
          nonce?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_certificate_material_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      company_certificates: {
        Row: {
          cnpj: string
          company_id: string
          created_at: string
          holder: string
          id: string
          issuer: string
          organization_id: string
          replaced_at: string | null
          serial_number: string
          status: string
          uploaded_by: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          cnpj: string
          company_id: string
          created_at?: string
          holder: string
          id?: string
          issuer: string
          organization_id: string
          replaced_at?: string | null
          serial_number: string
          status: string
          uploaded_by: string
          valid_from: string
          valid_until: string
        }
        Update: {
          cnpj?: string
          company_id?: string
          created_at?: string
          holder?: string
          id?: string
          issuer?: string
          organization_id?: string
          replaced_at?: string | null
          serial_number?: string
          status?: string
          uploaded_by?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_certificates_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      company_customers: {
        Row: {
          change_origin: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id: string | null
          company_id: string
          created_at: string
          created_by: string
          customer_data: Json
          external_id: string | null
          id: string
          organization_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          customer_data: Json
          external_id?: string | null
          id?: string
          organization_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          customer_data?: Json
          external_id?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_customers_changed_by_integration_id_fkey"
            columns: ["changed_by_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_customers_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fiscal_settings: {
        Row: {
          approx_federal_percent: number | null
          approx_municipal_percent: number | null
          approx_simples_percent: number | null
          approx_state_percent: number | null
          approx_taxes_mode: string
          change_origin: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id: string | null
          cnpj: string
          company_id: string
          created_at: string
          created_by: string
          dps_series: number
          ibscbs_simples_regime: number | null
          organization_id: string
          print_danfse_receipt: boolean
          simples_iss_withholding_percent: number | null
          simples_nacional_option: number
          simples_nacional_regime: number | null
          special_tax_regime: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          approx_federal_percent?: number | null
          approx_municipal_percent?: number | null
          approx_simples_percent?: number | null
          approx_state_percent?: number | null
          approx_taxes_mode: string
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          cnpj: string
          company_id: string
          created_at?: string
          created_by: string
          dps_series: number
          ibscbs_simples_regime?: number | null
          organization_id: string
          print_danfse_receipt?: boolean
          simples_iss_withholding_percent?: number | null
          simples_nacional_option: number
          simples_nacional_regime?: number | null
          special_tax_regime?: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          approx_federal_percent?: number | null
          approx_municipal_percent?: number | null
          approx_simples_percent?: number | null
          approx_state_percent?: number | null
          approx_taxes_mode?: string
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          cnpj?: string
          company_id?: string
          created_at?: string
          created_by?: string
          dps_series?: number
          ibscbs_simples_regime?: number | null
          organization_id?: string
          print_danfse_receipt?: boolean
          simples_iss_withholding_percent?: number | null
          simples_nacional_option?: number
          simples_nacional_regime?: number | null
          special_tax_regime?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_fiscal_settings_changed_by_integration_id_fkey"
            columns: ["changed_by_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fiscal_settings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      company_readiness_state: {
        Row: {
          company_id: string
          environment: Database["public"]["Enums"]["environment"]
          pending: string[]
          ready: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          environment: Database["public"]["Enums"]["environment"]
          pending?: string[]
          ready: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          environment?: Database["public"]["Enums"]["environment"]
          pending?: string[]
          ready?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_readiness_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_service_profiles: {
        Row: {
          active: boolean
          change_origin: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id: string | null
          company_id: string
          created_at: string
          created_by: string
          default_description: string
          external_id: string | null
          ibscbs_classification: string | null
          ibscbs_final_consumer: boolean
          ibscbs_operation_indicator: string | null
          id: string
          immunity_type: number | null
          iss_taxation: number
          iss_withholding: number
          municipal_benefit_number: string | null
          municipal_tax_code: string | null
          name: string
          nbs_code: string | null
          organization_id: string
          service_code: string
          simples_activity_code: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          active?: boolean
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          default_description?: string
          external_id?: string | null
          ibscbs_classification?: string | null
          ibscbs_final_consumer?: boolean
          ibscbs_operation_indicator?: string | null
          id?: string
          immunity_type?: number | null
          iss_taxation?: number
          iss_withholding?: number
          municipal_benefit_number?: string | null
          municipal_tax_code?: string | null
          name: string
          nbs_code?: string | null
          organization_id: string
          service_code: string
          simples_activity_code?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          active?: boolean
          change_origin?: Database["public"]["Enums"]["change_origin"]
          changed_by_integration_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          default_description?: string
          external_id?: string | null
          ibscbs_classification?: string | null
          ibscbs_final_consumer?: boolean
          ibscbs_operation_indicator?: string | null
          id?: string
          immunity_type?: number | null
          iss_taxation?: number
          iss_withholding?: number
          municipal_benefit_number?: string | null
          municipal_tax_code?: string | null
          name?: string
          nbs_code?: string | null
          organization_id?: string
          service_code?: string
          simples_activity_code?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_service_profiles_changed_by_integration_id_fkey"
            columns: ["changed_by_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_service_profiles_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_service_profiles_ibscbs_classification_fkey"
            columns: ["ibscbs_classification"]
            isOneToOne: false
            referencedRelation: "ibscbs_classifications"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_service_profiles_ibscbs_operation_indicator_fkey"
            columns: ["ibscbs_operation_indicator"]
            isOneToOne: false
            referencedRelation: "ibscbs_operation_indicators"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_service_profiles_nbs_code_fkey"
            columns: ["nbs_code"]
            isOneToOne: false
            referencedRelation: "nbs_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "company_service_profiles_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "service_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      countries: {
        Row: {
          iso2: string
          name: string
        }
        Insert: {
          iso2: string
          name: string
        }
        Update: {
          iso2?: string
          name?: string
        }
        Relationships: []
      }
      dps_sequences: {
        Row: {
          cnpj: string
          company_id: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          exhausted: boolean
          next_number: number
          organization_id: string
          series: number
          updated_at: string
        }
        Insert: {
          cnpj: string
          company_id: string
          created_at?: string
          environment: Database["public"]["Enums"]["environment"]
          exhausted?: boolean
          next_number?: number
          organization_id: string
          series: number
          updated_at?: string
        }
        Update: {
          cnpj?: string
          company_id?: string
          created_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          exhausted?: boolean
          next_number?: number
          organization_id?: string
          series?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dps_sequences_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      fiscal_catalog_versions: {
        Row: {
          catalog: string
          loaded_at: string
          row_count: number
          source_file: string
          source_sha256: string
          version: string
        }
        Insert: {
          catalog: string
          loaded_at?: string
          row_count: number
          source_file: string
          source_sha256: string
          version: string
        }
        Update: {
          catalog?: string
          loaded_at?: string
          row_count?: number
          source_file?: string
          source_sha256?: string
          version?: string
        }
        Relationships: []
      }
      fiscal_xml_files: {
        Row: {
          created_at: string
          kind: string
          owner_id: string
          owner_table: string
          path: string
          sha256: string
          size: number
          stored_size: number
        }
        Insert: {
          created_at?: string
          kind: string
          owner_id: string
          owner_table: string
          path: string
          sha256: string
          size: number
          stored_size: number
        }
        Update: {
          created_at?: string
          kind?: string
          owner_id?: string
          owner_table?: string
          path?: string
          sha256?: string
          size?: number
          stored_size?: number
        }
        Relationships: []
      }
      ibscbs_classifications: {
        Row: {
          catalog_version: string
          cbs_reduction_percent: number
          code: string
          cst: string
          cst_description: string
          deferral: boolean
          description: string
          donation_type: string | null
          ibs_reduction_percent: number
          legislation_url: string | null
          presumed_credit: boolean
          regular_taxation: boolean
          requires_taxation: boolean
          simples_revenue_type: string | null
        }
        Insert: {
          catalog_version: string
          cbs_reduction_percent: number
          code: string
          cst: string
          cst_description: string
          deferral: boolean
          description: string
          donation_type?: string | null
          ibs_reduction_percent: number
          legislation_url?: string | null
          presumed_credit: boolean
          regular_taxation: boolean
          requires_taxation: boolean
          simples_revenue_type?: string | null
        }
        Update: {
          catalog_version?: string
          cbs_reduction_percent?: number
          code?: string
          cst?: string
          cst_description?: string
          deferral?: boolean
          description?: string
          donation_type?: string | null
          ibs_reduction_percent?: number
          legislation_url?: string | null
          presumed_credit?: boolean
          regular_taxation?: boolean
          requires_taxation?: boolean
          simples_revenue_type?: string | null
        }
        Relationships: []
      }
      ibscbs_operation_indicators: {
        Row: {
          active: boolean
          catalog_version: string | null
          code: string
          incidence_location: string | null
          legal_basis: string | null
          location_to_identify: string
          notes: string | null
          operation_location: string
          operation_type: string
          supply_characteristic: string
        }
        Insert: {
          active?: boolean
          catalog_version?: string | null
          code: string
          incidence_location?: string | null
          legal_basis?: string | null
          location_to_identify: string
          notes?: string | null
          operation_location: string
          operation_type: string
          supply_characteristic: string
        }
        Update: {
          active?: boolean
          catalog_version?: string | null
          code?: string
          incidence_location?: string | null
          legal_basis?: string | null
          location_to_identify?: string
          notes?: string | null
          operation_location?: string
          operation_type?: string
          supply_characteristic?: string
        }
        Relationships: []
      }
      ibscbs_service_correlations: {
        Row: {
          catalog_version: string
          classifications: Json
          item_description: string | null
          nbs: Json
          operation_indicators: Json
          service_item: string
          simples_activity: string | null
          simples_activity_description: string | null
        }
        Insert: {
          catalog_version: string
          classifications?: Json
          item_description?: string | null
          nbs?: Json
          operation_indicators?: Json
          service_item: string
          simples_activity?: string | null
          simples_activity_description?: string | null
        }
        Update: {
          catalog_version?: string
          classifications?: Json
          item_description?: string | null
          nbs?: Json
          operation_indicators?: Json
          service_item?: string
          simples_activity?: string | null
          simples_activity_description?: string | null
        }
        Relationships: []
      }
      integration_companies: {
        Row: {
          company_id: string
          integration_id: string
          organization_id: string
        }
        Insert: {
          company_id: string
          integration_id: string
          organization_id: string
        }
        Update: {
          company_id?: string
          integration_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_companies_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integration_companies_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      integration_keys: {
        Row: {
          created_at: string
          created_by: string
          environment: Database["public"]["Enums"]["environment"]
          id: string
          integration_id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          environment: Database["public"]["Enums"]["environment"]
          id?: string
          integration_id: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          environment?: Database["public"]["Enums"]["environment"]
          id?: string
          integration_id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_keys_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integration_keys_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          active: boolean
          company_scope: string
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_scope: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_scope?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          requires_explicit_acceptance: boolean
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          requires_explicit_acceptance?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          requires_explicit_acceptance?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_dps_attempts: {
        Row: {
          created_at: string
          disposition: string
          dps_id: string
          government_response: Json
          id: string
          invoice_id: string
          number: number
          organization_id: string
          series: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          disposition: string
          dps_id: string
          government_response: Json
          id?: string
          invoice_id: string
          number: number
          organization_id: string
          series: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          disposition?: string
          dps_id?: string
          government_response?: Json
          id?: string
          invoice_id?: string
          number?: number
          organization_id?: string
          series?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_dps_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_dps_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          created_at: string
          details: Json
          id: string
          invoice_id: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          invoice_id: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          invoice_id?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_organization_id_fkey"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      invoice_fiscal_events: {
        Row: {
          can_request_analysis: boolean
          claim_token: string | null
          code: string
          company_id: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          government_errors: Json
          government_response: Json | null
          id: string
          idempotency_key: string
          integration_id: string | null
          invoice_id: string
          justification: string
          lease_until: string | null
          next_verification_at: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["change_origin"]
          reason: string
          registered_at: string | null
          registered_outside: boolean
          request_hash: string
          request_id: string
          requested_by: string
          sequence: number
          status: string
          updated_at: string
          verification_started_at: string | null
        }
        Insert: {
          can_request_analysis?: boolean
          claim_token?: string | null
          code: string
          company_id: string
          created_at?: string
          environment: Database["public"]["Enums"]["environment"]
          government_errors?: Json
          government_response?: Json | null
          id?: string
          idempotency_key: string
          integration_id?: string | null
          invoice_id: string
          justification: string
          lease_until?: string | null
          next_verification_at?: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["change_origin"]
          reason: string
          registered_at?: string | null
          registered_outside?: boolean
          request_hash: string
          request_id: string
          requested_by: string
          sequence?: number
          status?: string
          updated_at?: string
          verification_started_at?: string | null
        }
        Update: {
          can_request_analysis?: boolean
          claim_token?: string | null
          code?: string
          company_id?: string
          created_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          government_errors?: Json
          government_response?: Json | null
          id?: string
          idempotency_key?: string
          integration_id?: string | null
          invoice_id?: string
          justification?: string
          lease_until?: string | null
          next_verification_at?: string | null
          organization_id?: string
          origin?: Database["public"]["Enums"]["change_origin"]
          reason?: string
          registered_at?: string | null
          registered_outside?: boolean
          request_hash?: string
          request_id?: string
          requested_by?: string
          sequence?: number
          status?: string
          updated_at?: string
          verification_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_fiscal_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_fiscal_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_fiscal_events_invoice_id_organization_id_fkey"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_fiscal_events_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }
        Insert: {
          access_key?: string | null
          authorized_at?: string | null
          cancellation?: Json | null
          change_origin?: Database["public"]["Enums"]["change_origin"]
          claim_token?: string | null
          company_id: string
          competence: string
          complementary_information?: string | null
          created_at?: string
          created_by: string
          customer_snapshot?: Json | null
          description: string
          dispatch_state?: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id?: string | null
          external_number_retries?: number
          fiscal_snapshot: Json
          government_errors?: Json
          government_values?: Json | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          last_attempt_at?: string | null
          lease_until?: string | null
          manifestation?: Json | null
          next_verification_at?: string | null
          nfse_number?: string | null
          organization_id: string
          pending_operation?: Json | null
          provider_snapshot: Json
          request_hash?: string | null
          restrictions?: Json
          sent_values: Json
          service_location: Json
          service_profile_id?: string | null
          service_snapshot: Json
          status?: string
          substituted_by_invoice_id?: string | null
          substitutes_invoice_id?: string | null
          updated_at?: string
          updated_by: string
          verification_started_at?: string | null
        }
        Update: {
          access_key?: string | null
          authorized_at?: string | null
          cancellation?: Json | null
          change_origin?: Database["public"]["Enums"]["change_origin"]
          claim_token?: string | null
          company_id?: string
          competence?: string
          complementary_information?: string | null
          created_at?: string
          created_by?: string
          customer_snapshot?: Json | null
          description?: string
          dispatch_state?: string
          dps_id?: string
          dps_number?: number
          dps_series?: number
          emitted_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          external_id?: string | null
          external_number_retries?: number
          fiscal_snapshot?: Json
          government_errors?: Json
          government_values?: Json | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          last_attempt_at?: string | null
          lease_until?: string | null
          manifestation?: Json | null
          next_verification_at?: string | null
          nfse_number?: string | null
          organization_id?: string
          pending_operation?: Json | null
          provider_snapshot?: Json
          request_hash?: string | null
          restrictions?: Json
          sent_values?: Json
          service_location?: Json
          service_profile_id?: string | null
          service_snapshot?: Json
          status?: string
          substituted_by_invoice_id?: string | null
          substitutes_invoice_id?: string | null
          updated_at?: string
          updated_by?: string
          verification_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_profile_id_fkey"
            columns: ["service_profile_id"]
            isOneToOne: false
            referencedRelation: "company_service_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_substituted_by_invoice_id_fkey"
            columns: ["substituted_by_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_substitutes_invoice_id_fkey"
            columns: ["substitutes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      municipalities: {
        Row: {
          ibge_code: string
          name: string
          state: string
          state_name: string
        }
        Insert: {
          ibge_code: string
          name: string
          state: string
          state_name: string
        }
        Update: {
          ibge_code?: string
          name?: string
          state?: string
          state_name?: string
        }
        Relationships: []
      }
      municipality_agreement_queries: {
        Row: {
          company_id: string
          created_at: string
          duration_ms: number | null
          environment: Database["public"]["Enums"]["environment"]
          error_code: string | null
          http_status: number | null
          id: string
          municipality_ibge_code: string
          organization_id: string
          requested_by: string
          response_body: string | null
          url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_ms?: number | null
          environment: Database["public"]["Enums"]["environment"]
          error_code?: string | null
          http_status?: number | null
          id?: string
          municipality_ibge_code: string
          organization_id: string
          requested_by: string
          response_body?: string | null
          url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          environment?: Database["public"]["Enums"]["environment"]
          error_code?: string | null
          http_status?: number | null
          id?: string
          municipality_ibge_code?: string
          organization_id?: string
          requested_by?: string
          response_body?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "municipality_agreement_queries_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      nbs_codes: {
        Row: {
          code: string
          description: string
          formatted_code: string
        }
        Insert: {
          code: string
          description: string
          formatted_code: string
        }
        Update: {
          code?: string
          description?: string
          formatted_code?: string
        }
        Relationships: []
      }
      nfse_daily_checks: {
        Row: {
          checked: number
          company_id: string
          environment: Database["public"]["Enums"]["environment"]
          failed: number
          last_checked_at: string
          organization_id: string
          run_date: string
          updated: number
        }
        Insert: {
          checked?: number
          company_id: string
          environment: Database["public"]["Enums"]["environment"]
          failed?: number
          last_checked_at?: string
          organization_id: string
          run_date: string
          updated?: number
        }
        Update: {
          checked?: number
          company_id?: string
          environment?: Database["public"]["Enums"]["environment"]
          failed?: number
          last_checked_at?: string
          organization_id?: string
          run_date?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfse_daily_checks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_document_events: {
        Row: {
          access_key: string
          adn_type: string | null
          applied_at: string | null
          author_document: string | null
          code: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          event_at: string | null
          id: string
          invoice_id: string | null
          processed_at: string | null
          reason_code: string | null
          reason_text: string | null
          requested_by_notem: boolean
          sequence: number
          source: string
          substitute_key: string | null
          webhook_emitted_at: string | null
          webhook_type: string | null
        }
        Insert: {
          access_key: string
          adn_type?: string | null
          applied_at?: string | null
          author_document?: string | null
          code: string
          created_at?: string
          environment: Database["public"]["Enums"]["environment"]
          event_at?: string | null
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          reason_code?: string | null
          reason_text?: string | null
          requested_by_notem?: boolean
          sequence?: number
          source: string
          substitute_key?: string | null
          webhook_emitted_at?: string | null
          webhook_type?: string | null
        }
        Update: {
          access_key?: string
          adn_type?: string | null
          applied_at?: string | null
          author_document?: string | null
          code?: string
          created_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          event_at?: string | null
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          reason_code?: string | null
          reason_text?: string | null
          requested_by_notem?: boolean
          sequence?: number
          source?: string
          substitute_key?: string | null
          webhook_emitted_at?: string | null
          webhook_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_document_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_documents: {
        Row: {
          access_key: string
          authorized_at: string | null
          cancellation: Json | null
          competence: string | null
          created_at: string
          dps_id: string | null
          dps_number: string | null
          dps_series: string | null
          environment: Database["public"]["Enums"]["environment"]
          first_nsu: number | null
          id: string
          intermediary_document: string | null
          intermediary_name: string | null
          invoice_id: string | null
          issued_at: string | null
          manifestation: Json | null
          nfse_number: string | null
          provider_cnpj: string | null
          provider_name: string | null
          restrictions: Json
          status: string
          substituted_by_key: string | null
          substitutes_key: string | null
          summary: Json
          taker_document: string | null
          taker_name: string | null
          updated_at: string
        }
        Insert: {
          access_key: string
          authorized_at?: string | null
          cancellation?: Json | null
          competence?: string | null
          created_at?: string
          dps_id?: string | null
          dps_number?: string | null
          dps_series?: string | null
          environment: Database["public"]["Enums"]["environment"]
          first_nsu?: number | null
          id?: string
          intermediary_document?: string | null
          intermediary_name?: string | null
          invoice_id?: string | null
          issued_at?: string | null
          manifestation?: Json | null
          nfse_number?: string | null
          provider_cnpj?: string | null
          provider_name?: string | null
          restrictions?: Json
          status?: string
          substituted_by_key?: string | null
          substitutes_key?: string | null
          summary?: Json
          taker_document?: string | null
          taker_name?: string | null
          updated_at?: string
        }
        Update: {
          access_key?: string
          authorized_at?: string | null
          cancellation?: Json | null
          competence?: string | null
          created_at?: string
          dps_id?: string | null
          dps_number?: string | null
          dps_series?: string | null
          environment?: Database["public"]["Enums"]["environment"]
          first_nsu?: number | null
          id?: string
          intermediary_document?: string | null
          intermediary_name?: string | null
          invoice_id?: string | null
          issued_at?: string | null
          manifestation?: Json | null
          nfse_number?: string | null
          provider_cnpj?: string | null
          provider_name?: string | null
          restrictions?: Json
          status?: string
          substituted_by_key?: string | null
          substitutes_key?: string | null
          summary?: Json
          taker_document?: string | null
          taker_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfse_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_key_refreshes: {
        Row: {
          access_key: string
          environment: Database["public"]["Enums"]["environment"]
          last_requested_at: string
          purpose: string
        }
        Insert: {
          access_key: string
          environment: Database["public"]["Enums"]["environment"]
          last_requested_at?: string
          purpose: string
        }
        Update: {
          access_key?: string
          environment?: Database["public"]["Enums"]["environment"]
          last_requested_at?: string
          purpose?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug?: string
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          ibscbs_required_production_from: string
          ibscbs_required_sandbox_from: string
          id: boolean
          nt009r1_production_starts_at: string
          nt009r2_production_starts_at: string | null
          nt009r2_sandbox_starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ibscbs_required_production_from?: string
          ibscbs_required_sandbox_from?: string
          id?: boolean
          nt009r1_production_starts_at?: string
          nt009r2_production_starts_at?: string | null
          nt009r2_sandbox_starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ibscbs_required_production_from?: string
          ibscbs_required_sandbox_from?: string
          id?: boolean
          nt009r1_production_starts_at?: string
          nt009r2_production_starts_at?: string | null
          nt009r2_sandbox_starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          environment: Database["public"]["Enums"]["environment"]
          id: string
          last_organization_id: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          environment?: Database["public"]["Enums"]["environment"]
          id: string
          last_organization_id?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          environment?: Database["public"]["Enums"]["environment"]
          id?: string
          last_organization_id?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_org_fk"
            columns: ["last_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_change_audit: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          action: string
          company_id: string | null
          created_at: string
          id: string
          integration_id: string | null
          integration_name: string
          item: string
          key_id: string | null
          method: string
          organization_id: string
          path: string
          request_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          integration_name: string
          item: string
          key_id?: string | null
          method: string
          organization_id: string
          path: string
          request_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          integration_name?: string
          item?: string
          key_id?: string | null
          method?: string
          organization_id?: string
          path?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_change_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_change_audit_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_change_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_codes: {
        Row: {
          code: string
          description: string
          group_description: string
        }
        Insert: {
          code: string
          description: string
          group_description: string
        }
        Update: {
          code?: string
          description?: string
          group_description?: string
        }
        Relationships: []
      }
      system_heartbeats: {
        Row: {
          last_success_at: string
          name: string
          updated_at: string
        }
        Insert: {
          last_success_at: string
          name: string
          updated_at?: string
        }
        Update: {
          last_success_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_alerts: {
        Row: {
          created_at: string
          endpoint_id: string
          environment: Database["public"]["Enums"]["environment"]
          episode_at: string
          id: string
          integration_id: string
          message: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          environment: Database["public"]["Enums"]["environment"]
          episode_at: string
          id?: string
          integration_id: string
          message: string
          organization_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          environment?: Database["public"]["Enums"]["environment"]
          episode_at?: string
          id?: string
          integration_id?: string
          message?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_alerts_endpoint_id_organization_id_integration_id__fkey"
            columns: [
              "endpoint_id",
              "organization_id",
              "integration_id",
              "environment",
            ]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: [
              "id",
              "organization_id",
              "integration_id",
              "environment",
            ]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          claim_token: string | null
          created_at: string
          cycle: number
          duration_ms: number | null
          endpoint_id: string
          environment: Database["public"]["Enums"]["environment"]
          error: string | null
          event_id: string
          id: string
          integration_id: string
          lease_until: string | null
          next_attempt_at: string
          organization_id: string
          response_body: string | null
          response_status: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt: number
          claim_token?: string | null
          created_at?: string
          cycle?: number
          duration_ms?: number | null
          endpoint_id: string
          environment: Database["public"]["Enums"]["environment"]
          error?: string | null
          event_id: string
          id: string
          integration_id: string
          lease_until?: string | null
          next_attempt_at?: string
          organization_id: string
          response_body?: string | null
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          claim_token?: string | null
          created_at?: string
          cycle?: number
          duration_ms?: number | null
          endpoint_id?: string
          environment?: Database["public"]["Enums"]["environment"]
          error?: string | null
          event_id?: string
          id?: string
          integration_id?: string
          lease_until?: string | null
          next_attempt_at?: string
          organization_id?: string
          response_body?: string | null
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_organization_id_integration_fkey"
            columns: [
              "endpoint_id",
              "organization_id",
              "integration_id",
              "environment",
            ]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: [
              "id",
              "organization_id",
              "integration_id",
              "environment",
            ]
          },
          {
            foreignKeyName: "webhook_deliveries_event_id_organization_id_integration_id_fkey"
            columns: [
              "event_id",
              "organization_id",
              "integration_id",
              "environment",
            ]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: [
              "id",
              "organization_id",
              "integration_id",
              "environment",
            ]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          auth_configured: boolean | null
          auth_header: string | null
          auth_value: Json | null
          company_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          disabled_reason: string | null
          environment: Database["public"]["Enums"]["environment"]
          events: string[]
          failing_since: string | null
          id: string
          integration_id: string
          last_success_at: string | null
          organization_id: string
          previous_secret: Json | null
          previous_secret_expires_at: string | null
          secret: Json | null
          secret_prefix: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          auth_configured?: boolean | null
          auth_header?: string | null
          auth_value?: Json | null
          company_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string
          disabled_reason?: string | null
          environment: Database["public"]["Enums"]["environment"]
          events: string[]
          failing_since?: string | null
          id?: string
          integration_id: string
          last_success_at?: string | null
          organization_id: string
          previous_secret?: Json | null
          previous_secret_expires_at?: string | null
          secret?: Json | null
          secret_prefix: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          auth_configured?: boolean | null
          auth_header?: string | null
          auth_value?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string
          disabled_reason?: string | null
          environment?: Database["public"]["Enums"]["environment"]
          events?: string[]
          failing_since?: string | null
          id?: string
          integration_id?: string
          last_success_at?: string | null
          organization_id?: string
          previous_secret?: Json | null
          previous_secret_expires_at?: string | null
          secret?: Json | null
          secret_prefix?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoint_company_fk"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "webhook_endpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          body: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          id: string
          integration_id: string
          organization_id: string
          payload: Json
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          environment: Database["public"]["Enums"]["environment"]
          id: string
          integration_id: string
          organization_id: string
          payload: Json
          type: string
        }
        Update: {
          body?: string
          created_at?: string
          environment?: Database["public"]["Enums"]["environment"]
          id?: string
          integration_id?: string
          organization_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      webhook_scheduler_runs: {
        Row: {
          completed: number
          created_at: string
          disabled: number
          error: string | null
          failed: number
          id: string
          reserved: number
        }
        Insert: {
          completed?: number
          created_at?: string
          disabled?: number
          error?: string | null
          failed?: number
          id?: string
          reserved?: number
        }
        Update: {
          completed?: number
          created_at?: string
          disabled?: number
          error?: string | null
          failed?: number
          id?: string
          reserved?: number
        }
        Relationships: []
      }
      webhook_secret_reveals: {
        Row: {
          actor_id: string
          created_at: string
          endpoint_id: string
          id: string
          organization_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          endpoint_id: string
          id?: string
          organization_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          endpoint_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_secret_reveals_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_secret_reveals_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { invitation_id: string }; Returns: string }
      adn_next_missing_nsu: {
        Args: {
          _cnpj: string
          _env: Database["public"]["Enums"]["environment"]
          _from: number
        }
        Returns: number
      }
      api_rate_check: { Args: { _org: string; _rules: Json }; Returns: Json }
      api_slot_acquire: {
        Args: { _max: number; _scope: string; _ttl: number }
        Returns: string
      }
      api_slot_release: { Args: { _token: string }; Returns: undefined }
      apply_nfse_event: { Args: { _id: string }; Returns: string }
      approximate_tax_rule_error: {
        Args: { _mode: string; _option: number }
        Returns: string
      }
      can_issue_fiscal_change: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      can_request_adn_sync: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      claim_adn_cursors: {
        Args: {
          _cnpj?: string
          _env?: Database["public"]["Enums"]["environment"]
          _limit: number
        }
        Returns: {
          actor: string
          claim_token: string
          cnpj: string
          company_id: string
          environment: Database["public"]["Enums"]["environment"]
          failures: number
          next_nsu: number
          organization_id: string
          request: Json
        }[]
      }
      claim_fiscal_event_dispatch: {
        Args: { _id: string; _org: string }
        Returns: {
          can_request_analysis: boolean
          claim_token: string | null
          code: string
          company_id: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          government_errors: Json
          government_response: Json | null
          id: string
          idempotency_key: string
          integration_id: string | null
          invoice_id: string
          justification: string
          lease_until: string | null
          next_verification_at: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["change_origin"]
          reason: string
          registered_at: string | null
          registered_outside: boolean
          request_hash: string
          request_id: string
          requested_by: string
          sequence: number
          status: string
          updated_at: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_fiscal_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_fiscal_event_verifications: {
        Args: { _limit?: number }
        Returns: {
          can_request_analysis: boolean
          claim_token: string | null
          code: string
          company_id: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          government_errors: Json
          government_response: Json | null
          id: string
          idempotency_key: string
          integration_id: string | null
          invoice_id: string
          justification: string
          lease_until: string | null
          next_verification_at: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["change_origin"]
          reason: string
          registered_at: string | null
          registered_outside: boolean
          request_hash: string
          request_id: string
          requested_by: string
          sequence: number
          status: string
          updated_at: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_fiscal_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_invoice_dispatch: {
        Args: { _id: string; _org: string }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_invoice_verifications: {
        Args: { _limit?: number }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_deliveries: {
        Args: { _event?: string; _limit?: number }
        Returns: {
          attempt: number
          claim_token: string | null
          created_at: string
          cycle: number
          duration_ms: number | null
          endpoint_id: string
          environment: Database["public"]["Enums"]["environment"]
          error: string | null
          event_id: string
          id: string
          integration_id: string
          lease_until: string | null
          next_attempt_at: string
          organization_id: string
          response_body: string | null
          response_status: number | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_fiscal_event_request: { Args: { _payload: Json }; Returns: Json }
      create_integration: {
        Args: { _actor: string; _org: string; _payload: Json }
        Returns: string
      }
      create_invoice_request: {
        Args: { _payload: Json }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      daily_check_candidates: {
        Args: { _limit: number }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_company_if_unused: {
        Args: { _company: string; _org: string }
        Returns: string
      }
      disable_failing_webhooks: { Args: never; Returns: number }
      emit_nfse_event_webhook: {
        Args: { _event: string; _nota: Json }
        Returns: number
      }
      emit_webhook_event: {
        Args: {
          _body: string
          _company?: string
          _endpoint?: string
          _environment: Database["public"]["Enums"]["environment"]
          _id: string
          _integration: string
          _org: string
          _type: string
        }
        Returns: number
      }
      finish_adn_batch: {
        Args: {
          _cnpj: string
          _env: Database["public"]["Enums"]["environment"]
          _items: Json
          _patch: Json
          _token: string
        }
        Returns: Json
      }
      finish_fiscal_event: {
        Args: {
          _id: string
          _invoice: Json
          _message: string
          _nota: Json
          _patch: Json
          _timeline: string
          _token: string
          _webhook?: string
        }
        Returns: {
          can_request_analysis: boolean
          claim_token: string | null
          code: string
          company_id: string
          created_at: string
          environment: Database["public"]["Enums"]["environment"]
          government_errors: Json
          government_response: Json | null
          id: string
          idempotency_key: string
          integration_id: string | null
          invoice_id: string
          justification: string
          lease_until: string | null
          next_verification_at: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["change_origin"]
          reason: string
          registered_at: string | null
          registered_outside: boolean
          request_hash: string
          request_id: string
          requested_by: string
          sequence: number
          status: string
          updated_at: string
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoice_fiscal_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_invoice_attempt: {
        Args: {
          _event: string
          _id: string
          _nota: Json
          _patch: Json
          _substituted_nota?: Json
          _token: string
        }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_webhook_delivery: {
        Args: {
          _duration: number
          _error: string
          _http: number
          _id: string
          _response: string
          _token: string
        }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          org_id: string
          roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      ibscbs_regime_allowed: {
        Args: { _iss_regime: number; _value: number }
        Returns: boolean
      }
      ibscbs_regime_default: { Args: { _iss_regime: number }; Returns: number }
      ibscbs_service_rule_error: {
        Args: {
          _activity: string
          _classification: string
          _indicator: string
          _service_code: string
        }
        Returns: string
      }
      integration_revocation_actors: {
        Args: { _org: string }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_valid_cnpj: { Args: { value: string }; Returns: boolean }
      list_org_notes: {
        Args: {
          _company?: string
          _env: Database["public"]["Enums"]["environment"]
          _external_id?: string
          _from?: string
          _limit?: number
          _offset?: number
          _org: string
          _origin?: string
          _status?: string
          _taker?: string
          _to?: string
        }
        Returns: {
          company_id: string
          id: string
          issued_at: string
          origin: string
        }[]
      }
      manage_integration: {
        Args: {
          _action: string
          _actor: string
          _id: string
          _org: string
          _payload: Json
        }
        Returns: string
      }
      manage_webhook: {
        Args: {
          _action: string
          _actor: string
          _id: string
          _integration: string
          _org: string
          _payload: Json
        }
        Returns: string
      }
      normalize_cnpj: { Args: { value: string }; Returns: string }
      normalize_municipality_name: { Args: { value: string }; Returns: string }
      org_proven_cnpj: {
        Args: { _cnpj: string; _org: string }
        Returns: boolean
      }
      organization_team: {
        Args: { org_id: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      pending_external_dps: {
        Args: { _limit?: number }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pending_invitations: {
        Args: never
        Returns: {
          id: string
          organization_id: string
          organization_name: string
          requires_explicit_acceptance: boolean
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      put_xml_file: {
        Args: {
          _file: Json
          _id: string
          _kind: string
          _replace?: boolean
          _table: string
        }
        Returns: undefined
      }
      record_daily_check: {
        Args: {
          _company: string
          _date: string
          _env: Database["public"]["Enums"]["environment"]
          _failed: boolean
          _org: string
          _updated: boolean
        }
        Returns: undefined
      }
      replace_company_certificate: {
        Args: {
          _cnpj: string
          _company_id: string
          _data: string
          _holder: string
          _issuer: string
          _key_version: string
          _nonce: string
          _organization_id: string
          _serial: string
          _user_id: string
          _valid_from: string
          _valid_until: string
        }
        Returns: string
      }
      replace_invoice_dps_base: {
        Args: {
          _file: Json
          _from: string
          _id: string
          _org: string
          _to: string
          _token: string
        }
        Returns: boolean
      }
      replay_webhook_delivery: {
        Args: { _actor: string; _id: string; _org: string }
        Returns: string
      }
      request_adn_sync: {
        Args: {
          _actor: string
          _cnpj: string
          _env: Database["public"]["Enums"]["environment"]
          _mode: string
          _months: number
          _org: string
        }
        Returns: Json
      }
      reserve_dps_number: {
        Args: {
          _company_id: string
          _environment: Database["public"]["Enums"]["environment"]
          _organization_id: string
          _requested_by: string
          _series: number
        }
        Returns: string
      }
      retry_external_dps: {
        Args: {
          _files?: Json
          _id: string
          _org: string
          _response: Json
          _token: string
        }
        Returns: {
          access_key: string | null
          authorized_at: string | null
          cancellation: Json | null
          change_origin: Database["public"]["Enums"]["change_origin"]
          claim_token: string | null
          company_id: string
          competence: string
          complementary_information: string | null
          created_at: string
          created_by: string
          customer_snapshot: Json | null
          description: string
          dispatch_state: string
          dps_id: string
          dps_number: number
          dps_series: number
          emitted_at: string
          environment: Database["public"]["Enums"]["environment"]
          external_id: string | null
          external_number_retries: number
          fiscal_snapshot: Json
          government_errors: Json
          government_values: Json | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          last_attempt_at: string | null
          lease_until: string | null
          manifestation: Json | null
          next_verification_at: string | null
          nfse_number: string | null
          organization_id: string
          pending_operation: Json | null
          provider_snapshot: Json
          request_hash: string | null
          restrictions: Json
          sent_values: Json
          service_location: Json
          service_profile_id: string | null
          service_snapshot: Json
          status: string
          substituted_by_invoice_id: string | null
          substitutes_invoice_id: string | null
          updated_at: string
          updated_by: string
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_fiscal_catalog: {
        Args: { _catalog: string; _search: string }
        Returns: {
          code: string
          description: string
          details: Json
        }[]
      }
      search_municipality_catalog: {
        Args: { search_term: string }
        Returns: {
          ibge_code: string
          name: string
          state: string
          state_name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "municipalities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_fiscal_platform_setting: {
        Args: { _actor: string; _setting: string; _value: string }
        Returns: {
          ibscbs_required_production_from: string
          ibscbs_required_sandbox_from: string
          id: boolean
          nt009r1_production_starts_at: string
          nt009r2_production_starts_at: string | null
          nt009r2_sandbox_starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_nt009_production_start: {
        Args: { _actor: string; _value: string }
        Returns: {
          ibscbs_required_production_from: string
          ibscbs_required_sandbox_from: string
          id: boolean
          nt009r1_production_starts_at: string
          nt009r2_production_starts_at: string | null
          nt009r2_sandbox_starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      special_tax_rule_error: {
        Args: {
          _option: number
          _regime: number
          _special: number
          _taxation?: number
        }
        Returns: string
      }
      store_nfse_document: {
        Args: {
          _d: Json
          _env: Database["public"]["Enums"]["environment"]
          _nsu: number
        }
        Returns: string
      }
      store_nfse_event: {
        Args: {
          _e: Json
          _env: Database["public"]["Enums"]["environment"]
          _source: string
        }
        Returns: string
      }
      store_nfse_events: {
        Args: {
          _env: Database["public"]["Enums"]["environment"]
          _items: Json
          _source: string
        }
        Returns: Json
      }
      touch_nfse_refresh: {
        Args: {
          _env: Database["public"]["Enums"]["environment"]
          _interval: string
          _key: string
          _purpose: string
        }
        Returns: string
      }
    }
    Enums: {
      change_origin: "panel" | "api"
      company_status: "configuring"
      environment: "production" | "sandbox"
      invitation_status: "pending" | "accepted" | "revoked"
      org_role: "owner" | "admin" | "operator" | "viewer" | "developer"
      organization_type: "partner" | "company"
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
      change_origin: ["panel", "api"],
      company_status: ["configuring"],
      environment: ["production", "sandbox"],
      invitation_status: ["pending", "accepted", "revoked"],
      org_role: ["owner", "admin", "operator", "viewer", "developer"],
      organization_type: ["partner", "company"],
    },
  },
} as const
