import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { useRiverWatch } from '@stball/react-river'
import { createAppTheme, type ThemeMode } from './theme'
import { themePreferenceProvider } from './providers/themeProvider'

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const preference = useRiverWatch(themePreferenceProvider)
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches)
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const mode: ThemeMode =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  const appTheme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
