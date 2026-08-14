import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { RiverScope } from '@stball/react-river'
import './index.css'
import './i18n.ts'
import App from './App.tsx'
import { registerPwa } from './pwa.ts'
import { theme } from './theme.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RiverScope>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </RiverScope>
  </StrictMode>,
)

registerPwa()
