import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d766e', dark: '#075c57', contrastText: '#ffffff' },
    secondary: { main: '#ee7c45' },
    background: { default: '#f3f7f5', paper: '#ffffff' },
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
          color: '#53615d',
          fontSize: '0.82rem',
          fontWeight: 700,
          lineHeight: 1.25,
          pointerEvents: 'auto',
          '&.Mui-focused': { color: '#0d766e' },
          '&.Mui-error': { color: '#d32f2f' },
          '&.Mui-disabled': { color: 'rgba(23, 33, 31, 0.38)' },
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
      styleOverrides: { root: { borderRadius: 14 } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, minHeight: 30 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
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
