import { createClient } from '@supabase/supabase-js'
import { config } from '../config'

export const isSupabaseConfigured = config.supabase.isConfigured

export const supabase = createClient(
  config.supabase.url || 'http://127.0.0.1:54321',
  config.supabase.publishableKey || 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
