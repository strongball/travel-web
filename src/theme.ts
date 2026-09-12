import { createTheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    surfaceSubtle: string
    surfaceSubtleHover: string
    surfaceSubtleBorder: string
    overlayBackdrop: string
    codeBackground: string
    codeOutputBackground: string
    quoteBackground: string
    primaryGradient: string
    navShadow: string
    cardShadow: string
    cardShadowHover: string
  }
  interface PaletteOptions {
    surfaceSubtle?: string
    surfaceSubtleHover?: string
    surfaceSubtleBorder?: string
    overlayBackdrop?: string
    codeBackground?: string
    codeOutputBackground?: string
    quoteBackground?: string
    primaryGradient?: string
    navShadow?: string
    cardShadow?: string
    cardShadowHover?: string
  }
}

export type ThemeMode = 'light' | 'dark'

export function createAppTheme(mode: ThemeMode = 'light') {
  const isDark = mode === 'dark'
  const primaryMain = isDark ? '#14b8a6' : '#0d766e'
  const primaryDark = isDark ? '#0d766e' : '#075c57'

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain, dark: primaryDark, contrastText: '#ffffff' },
      secondary: { main: isDark ? '#fb923c' : '#ee7c45' },
      background: {
        default: isDark ? '#0b1413' : '#f3f7f5',
        paper: isDark ? '#13201d' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f1f5f9' : '#1e293b',
        secondary: isDark ? '#94a3b8' : '#53615d',
      },
      divider: isDark ? 'rgba(20, 184, 166, 0.15)' : 'rgba(13, 118, 110, 0.12)',
      surfaceSubtle: isDark ? 'rgba(20, 184, 166, 0.12)' : 'rgba(13, 118, 110, 0.08)',
      surfaceSubtleHover: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(13, 118, 110, 0.14)',
      surfaceSubtleBorder: isDark ? 'rgba(20, 184, 166, 0.25)' : 'rgba(13, 118, 110, 0.16)',
      overlayBackdrop: isDark ? 'rgba(19, 32, 29, 0.72)' : 'rgba(255, 255, 255, 0.72)',
      codeBackground: isDark ? '#0b1120' : '#0f172a',
      codeOutputBackground: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
      quoteBackground: isDark ? 'rgba(20, 184, 166, 0.08)' : '#f0fdfa',
      primaryGradient: isDark
        ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
        : 'linear-gradient(135deg, #0d766e 0%, #095953 100%)',
      navShadow: isDark
        ? '0 -6px 20px rgba(0, 0, 0, 0.45)'
        : '0 -6px 20px rgba(15, 23, 42, 0.05)',
      cardShadow: isDark
        ? '0 4px 20px rgba(0, 0, 0, 0.4)'
        : '0 4px 20px rgba(15, 23, 42, 0.06)',
      cardShadowHover: isDark
        ? '0 4px 24px rgba(20, 184, 166, 0.25)'
        : '0 4px 24px rgba(13, 118, 110, 0.14)',
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: { fontWeight: 700, textTransform: 'none' },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 48,
            borderRadius: 10,
            paddingInline: 16,
          },
        },
      },
      MuiTextField: {
        defaultProps: { fullWidth: true, size: 'medium' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: 52,
            borderRadius: 8,
            '&.MuiInputBase-multiline': { minHeight: 'auto' },
          },
          input: { padding: '14px 14px' },
          notchedOutline: {
            '& legend': {
              maxWidth: '0 !important',
              padding: 0,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            position: 'relative',
            top: 'auto',
            left: 'auto',
            transform: 'none',
            maxWidth: 'none',
            marginBottom: 6,
            color: isDark ? '#94a3b8' : '#53615d',
            fontSize: '0.82rem',
            fontWeight: 700,
            lineHeight: 1.25,
            pointerEvents: 'auto',
            '&.Mui-focused': { color: primaryMain },
            '&.Mui-error': { color: '#d32f2f' },
            '&.Mui-disabled': { color: isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(23, 33, 31, 0.38)' },
          },
          formControl: {
            position: 'relative',
            top: 'auto',
            left: 'auto',
            transform: 'none',
            maxWidth: 'none',
          },
          shrink: {
            transform: 'none',
          },
          asterisk: { color: '#d32f2f' },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            minHeight: 'unset',
            display: 'flex',
            alignItems: 'center',
            paddingTop: '14px',
            paddingBottom: '14px',
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${isDark ? 'rgba(20, 184, 166, 0.18)' : 'rgba(13, 118, 110, 0.12)'}`,
            backgroundColor: isDark ? '#13201d' : '#ffffff',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: { borderRadius: 14 },
          outlined: {
            border: `1px solid ${isDark ? 'rgba(20, 184, 166, 0.18)' : 'rgba(13, 118, 110, 0.12)'}`,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: isDark ? 'rgba(20, 184, 166, 0.15)' : 'rgba(13, 118, 110, 0.08)',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 28,
            fontWeight: 700,
            '&.MuiChip-outlinedPrimary': {
              borderColor: isDark ? 'rgba(20, 184, 166, 0.35)' : 'rgba(13, 118, 110, 0.25)',
              backgroundColor: isDark ? 'rgba(20, 184, 166, 0.08)' : 'rgba(13, 118, 110, 0.04)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 16 } },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '12px 16px max(12px, env(safe-area-inset-bottom))',
            borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(23, 33, 31, 0.12)'}`,
            backgroundColor: isDark ? '#13201d' : '#ffffff',
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: { minHeight: 64 },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: { minWidth: 64, paddingBlock: 8 },
          label: { fontWeight: 700 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { minHeight: 48, paddingInline: 12, whiteSpace: 'nowrap' },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: 44, minHeight: 44 } },
      },
    },
  })
}

export const theme = createAppTheme('light')
