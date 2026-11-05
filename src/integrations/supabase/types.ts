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
      api_request_logs: {
        Row: {
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
      companies: {
        Row: {
          change_origin: Database["public"]["Enums"]["change_origin"]
          cnpj: string
          complement: string
          created_at: string
          created_by: string
          district: string
          email: string
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
          change_origin?: Database["public"]["Enums"]["change_origin"]
          cnpj: string
          complement?: string
          created_at?: string
          created_by: string
          district?: string
          email?: string
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
          change_origin?: Database["public"]["Enums"]["change_origin"]
          cnpj?: string
          complement?: string
          created_at?: string
          created_by?: string
          district?: string
          email?: string
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
      company_fiscal_settings: {
        Row: {
          approx_federal_percent: number | null
          approx_municipal_percent: number | null
          approx_simples_percent: number | null
          approx_state_percent: number | null
          approx_taxes_mode: string
          cnpj: string
          company_id: string
          created_at: string
          created_by: string
          dps_series: number
          organization_id: string
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
          cnpj: string
          company_id: string
          created_at?: string
          created_by: string
          dps_series: number
          organization_id: string
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
          cnpj?: string
          company_id?: string
          created_at?: string
          created_by?: string
          dps_series?: number
          organization_id?: string
          simples_iss_withholding_percent?: number | null
          simples_nacional_option?: number
          simples_nacional_regime?: number | null
          special_tax_regime?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_fiscal_settings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      company_service_profiles: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string
          default_description: string
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
          updated_at: string
          updated_by: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by: string
          default_description?: string
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
          updated_at?: string
          updated_by: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string
          default_description?: string
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
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_service_profiles_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
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
      ibscbs_operation_indicators: {
        Row: {
          code: string
          location_to_identify: string
          operation_location: string
          operation_type: string
          supply_characteristic: string
        }
        Insert: {
          code: string
          location_to_identify: string
          operation_location: string
          operation_type: string
          supply_characteristic: string
        }
        Update: {
          code?: string
          location_to_identify?: string
          operation_location?: string
          operation_type?: string
          supply_characteristic?: string
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
          id: string
          invited_by: string
          organization_id: string
          requires_explicit_acceptance: boolean
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          organization_id: string
          requires_explicit_acceptance?: boolean
          role: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          organization_id?: string
          requires_explicit_acceptance?: boolean
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
          slug: string
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
      create_integration: {
        Args: { _actor: string; _org: string; _payload: Json }
        Returns: string
      }
      disable_failing_webhooks: { Args: never; Returns: number }
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
      normalize_municipality_name: { Args: { value: string }; Returns: string }
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
      replay_webhook_delivery: {
        Args: { _actor: string; _id: string; _org: string }
        Returns: string
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
