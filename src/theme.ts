import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d766e', dark: '#075c57', contrastText: '#ffffff' },
    secondary: { main: '#ee7c45' },
    background: { default: '#f3f7f5', paper: '#ffffff' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 48, borderRadius: 14 } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, size: 'medium' },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 44, minHeight: 44 } },
    },
  },
})
