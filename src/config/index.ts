export interface SupabaseConfig {
  url: string
  publishableKey: string
  isConfigured: boolean
}

export interface GeminiConfig {
  model: string
}

export interface GoogleMapsConfig {
  apiKey: string
}

export interface AppConfig {
  isProd: boolean
  isDev: boolean
  baseUrl: string
}

export interface Config {
  supabase: SupabaseConfig
  gemini: GeminiConfig
  googleMaps: GoogleMapsConfig
  app: AppConfig
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const config: Config = {
  supabase: {
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
    isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  },
  gemini: {
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
  googleMaps: {
    apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '',
  },
  app: {
    isProd: import.meta.env.PROD,
    isDev: import.meta.env.DEV,
    baseUrl: import.meta.env.BASE_URL,
  },
}
