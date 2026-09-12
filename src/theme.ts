import { createTheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    surfaceSubtle: string
    surfaceSubtleHover: string
    surfaceSubtleBorder: string
    surfaceGlass: string
    secondarySubtle: string
    secondaryBorder: string
    accentPurple: string
    accentPurpleSubtle: string
    accentPurpleBorder: string
    overlayBackdrop: string
    codeBackground: string
    codeOutputBackground: string
    primaryGradient: string
    navShadow: string
    cardShadow: string
    cardShadowHover: string
  }
  interface PaletteOptions {
    surfaceSubtle?: string
    surfaceSubtleHover?: string
    surfaceSubtleBorder?: string
    surfaceGlass?: string
    secondarySubtle?: string
    secondaryBorder?: string
    accentPurple?: string
    accentPurpleSubtle?: string
    accentPurpleBorder?: string
    overlayBackdrop?: string
    codeBackground?: string
    codeOutputBackground?: string
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
      surfaceSubtle: isDark ? 'rgba(20, 184, 166, 0.12)' : 'rgba(13, 118, 110, 0.07)',
      surfaceSubtleHover: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(13, 118, 110, 0.12)',
      surfaceSubtleBorder: isDark ? 'rgba(20, 184, 166, 0.22)' : 'rgba(13, 118, 110, 0.14)',
      surfaceGlass: isDark ? 'rgba(19, 32, 29, 0.85)' : 'rgba(255, 255, 255, 0.85)',
      secondarySubtle: isDark ? 'rgba(251, 146, 60, 0.14)' : 'rgba(249, 115, 22, 0.08)',
      secondaryBorder: isDark ? 'rgba(251, 146, 60, 0.3)' : 'rgba(249, 115, 22, 0.22)',
      accentPurple: isDark ? '#a5b4fc' : '#4338ca',
      accentPurpleSubtle: isDark ? 'rgba(129, 140, 248, 0.14)' : 'rgba(99, 102, 241, 0.08)',
      accentPurpleBorder: isDark ? 'rgba(129, 140, 248, 0.28)' : 'rgba(99, 102, 241, 0.22)',
      overlayBackdrop: isDark ? 'rgba(19, 32, 29, 0.76)' : 'rgba(255, 255, 255, 0.76)',
      codeBackground: isDark ? '#0b1120' : '#0f172a',
      codeOutputBackground: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
      primaryGradient: isDark
        ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
        : 'linear-gradient(135deg, #0d766e 0%, #095953 100%)',
      navShadow: isDark
        ? '0 -4px 20px rgba(0, 0, 0, 0.5)'
        : '0 -4px 20px rgba(15, 23, 42, 0.05)',
      cardShadow: isDark
        ? '0 2px 10px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.45)'
        : '0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 8px 24px -4px rgba(13, 118, 110, 0.06)',
      cardShadowHover: isDark
        ? '0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.6)'
        : '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 12px 30px -4px rgba(13, 118, 110, 0.12)',
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Segoe UI", Roboto, sans-serif',
      h1: { fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2 },
      h2: { fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 },
      h3: { fontSize: '1.35rem', fontWeight: 750, letterSpacing: '-0.015em', lineHeight: 1.3 },
      h4: { fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.35 },
      h5: { fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.005em', lineHeight: 1.4 },
      h6: { fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.4 },
      subtitle1: { fontWeight: 600, lineHeight: 1.5 },
      subtitle2: { fontWeight: 600, lineHeight: 1.45 },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.55 },
      button: { fontWeight: 700, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: isDark
              ? 'radial-gradient(at 50% 0%, rgba(15, 118, 110, 0.14) 0px, transparent 60%), #0b1413'
              : 'radial-gradient(at 50% 0%, rgba(204, 251, 241, 0.45) 0px, transparent 60%), #f3f7f5',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            scrollbarWidth: 'thin',
            scrollbarColor: isDark
              ? 'rgba(255, 255, 255, 0.16) transparent'
              : 'rgba(13, 118, 110, 0.2) transparent',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 6,
              height: 6,
            },
            '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.16)'
                : 'rgba(13, 118, 110, 0.2)',
              borderRadius: 999,
              transition: 'background-color 150ms ease',
            },
            '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
              backgroundColor: isDark
                ? 'rgba(20, 184, 166, 0.45)'
                : 'rgba(13, 118, 110, 0.45)',
            },
          },
          '.tabular-nums': {
            fontVariantNumeric: 'tabular-nums',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 46,
            borderRadius: 12,
            paddingInline: 18,
            transition: 'all 160ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:active': {
              transform: 'scale(0.97)',
            },
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
            borderRadius: 18,
            border: `1px solid ${isDark ? 'rgba(20, 184, 166, 0.18)' : 'rgba(13, 118, 110, 0.12)'}`,
            backgroundColor: isDark ? '#13201d' : '#ffffff',
            transition: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: { borderRadius: 18 },
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
            borderRadius: 14,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 28,
            fontWeight: 700,
            transition: 'all 140ms ease',
            '&.MuiChip-outlinedPrimary': {
              borderColor: isDark ? 'rgba(20, 184, 166, 0.35)' : 'rgba(13, 118, 110, 0.25)',
              backgroundColor: isDark ? 'rgba(20, 184, 166, 0.08)' : 'rgba(13, 118, 110, 0.04)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 20 } },
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
        styleOverrides: {
          root: {
            minWidth: 42,
            minHeight: 42,
            transition: 'all 160ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:active': {
              transform: 'scale(0.92)',
            },
          },
        },
      },
    },
  })
}

export const theme = createAppTheme('light')
