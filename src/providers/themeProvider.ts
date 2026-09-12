import { stateProvider } from '@stball/react-river'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'travel_web_theme_preference'

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage might be blocked or unavailable
  }
  return 'system'
}

export function setStoredThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // ignore
  }
}

export const themePreferenceProvider = stateProvider<ThemePreference>(
  () => getStoredThemePreference(),
  { name: 'themePreference' },
)
