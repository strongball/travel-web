import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RiverScope } from '@stball/react-river'
import './index.css'
import './i18n.ts'
import App from './App.tsx'
import { AppThemeProvider } from './AppThemeProvider.tsx'
import { registerPwa } from './pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RiverScope>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </RiverScope>
  </StrictMode>,
)

registerPwa()
